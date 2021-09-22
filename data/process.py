import os
import json
import numpy as np
import pandas as pd
import geopandas as gpd
from glob import glob
from tqdm import tqdm

# These are often missing from data
TERRITORIES_FIPS = [
    '60', # American Samoa (AS)
    '66', # Guam (GU)
    '69', # Northern Mariana Islands (MP)
    '72', # Puerto Rico (PR)
    '78', # Virgin Islands (VI)
]


def process_geodata(data_or_path, key_prop, map_props, api_props, outkey, outfmt, process_fn=None, merge_with=None, compare_props=None):
    """
    - `map_props` are those that directly embedded in the tileset/geojson data
    - `api_props` are those that are queried separately from the "API" (really just a json file), to minimize the amount of data included per the tileset/geojson
    """
    compare_props = compare_props or []

    if outfmt is 'geojson':
        driver = 'GeoJSON'
    elif outfmt is 'geojsonl':
        driver = 'GeoJSONSeq'
    else:
        raise Exception('Unrecognized output format: "{}"'.format(outfmt.head()))

    if isinstance(data_or_path, str):
        print('Processing "{}"...'.format(data_or_path))
        df = gpd.read_file(data_or_path)
    else:
        print('Processing provided dataframe:\n{}'.format(data_or_path))
        df = data_or_path

    df.set_index(key_prop, inplace=True)

    print('  Converting CRS...')
    df.to_crs(crs='EPSG:4326', inplace=True)

    if process_fn is not None:
        print('  Applying processing function...')
        df = process_fn(df)

    if merge_with is not None:
        # Merge on index
        for other_df in tqdm(merge_with, desc='Merging with other dataframes...'):
            df = df.join(other_df)

    if api_props:
        print('  Extracting API properties: {}...'.format(api_props))
        if isinstance(api_props, dict):
            api_df = df.rename(columns=api_props)[api_props.values()]
            api_props = api_props.values()
        else:
            api_df = df[api_props]

        outdir = 'gen/{}'.format(outkey)
        if not os.path.exists(outdir):
            os.makedirs(outdir)

        for prop in api_props:
            if prop not in compare_props: continue
            median = api_df[prop].median()
            pct_diff = (api_df[prop] - median)/median
            api_df[f'{prop}__pct_diff'] = pct_diff

        api_df = api_df.where(pd.notnull(api_df), None) # Convert nans to nulls
        api_data = api_df.to_dict(orient='index')
        for id, data in tqdm(api_data.items(), desc='Writing API properties...'):
            with open('{}/{}.json'.format(outdir, id), 'w') as f:
                json.dump(data, f)

    print('  Extracting map properties: {}...'.format(map_props))
    if isinstance(map_props, dict):
        props = list(map_props.values())
        map_df = df.rename(columns=map_props)[['geometry'] + props]
        map_props = props
    else:
        map_df = df[['geometry'] + map_props]

    for prop in map_props:
        if prop not in compare_props: continue
        median = map_df[prop].median()
        pct_diff = (map_df[prop] - median)/median
        map_df[f'{prop}__pct_diff'] = pct_diff

    print('  Added compare properties: {}...'.format(compare_props))

    print('  Saving to format: "{}"...'.format(outfmt))
    map_df.to_file('gen/{}.{}'.format(outkey, outfmt), index=True, driver=driver)

    return df



def process_tracts():
    # Merge 2018 census tract shapefiles
    # Notes:
    # - 2020 census tracts are available, but using 2018 because the SVI data is only available for 2018
    # - Dropping census tracts with no land area, because these generally don't have additional data (e.g. SVI ranks)
    tracts_df = pd.concat([gpd.read_file(shpfile) for shpfile in glob('src/census_tracts/2018/shapefiles/*.shp')])
    tracts_df = tracts_df[tracts_df['ALAND'] > 0]

    # 2018 SVI data
    # -999 indicates unavailable data
    df_svi = pd.read_csv('src/svi/SVI2018_US.csv', dtype={'FIPS': str})
    df_svi.set_index('FIPS', inplace=True)
    df_svi.replace(-999, np.nan, inplace=True)

    # 2018 EJSCREEN data, which is at the census block group level
    # To get to tract GEOID (11 digits), just drop the last digit of
    # the ID (12 digits for block groups),
    # see the hierarchy diagram for GEOID here: <https://www.census.gov/programs-surveys/geography/guidance/geo-identifiers.html>
    # Notes:
    # - Some values are 'None' (a string) but I can't find any documentation explaining what it means.
    # - Data for PR is included, but not available in the census tract shapefiles, so we drop it
    # - 2020 EJSCREEN is available, but using 2018 because the SVI data is only available for 2018
    df_ej = pd.read_csv('src/ejscreen/2018/EJSCREEN_2018_USPR.csv', dtype={'ID': str})
    df_ej['TRACTID'] = df_ej['ID'].str[:11]
    df_ej = df_ej[~df_ej['TRACTID'].str.startswith('72')] # Drop PR, see note above

    keep_cols = [
        'CANCER', # Air toxics cancer risk
        'RESP', # Air toxics respiratory hazard index
    ]
    df_ej = df_ej[['TRACTID'] + keep_cols]
    df_ej = df_ej.replace('None', np.nan).dropna(axis = 0, how = 'any').astype({
        'CANCER': float,
        'RESP': float,
    })
    df_ej = df_ej.groupby('TRACTID').median()

    tract_ids = tracts_df['GEOID'].unique()
    ej_tracts = df_ej.index.unique()
    svi_tracts = df_svi.index.unique()

    missing_svis = set(tract_ids) - set(svi_tracts)
    print(len(missing_svis), 'tracts missing SVIs')

    missing_tracts = set(svi_tracts) - set(tract_ids)
    print(len(missing_tracts), 'SVIs missing tracts')

    missing_ejs = set(tract_ids) - set(ej_tracts)
    print(len(missing_ejs), 'tracts missing EJ data')

    missing_tracts = set(ej_tracts) - set(tract_ids)
    print(len(missing_tracts), 'EJ data missing tracts')

    process_geodata(tracts_df,
            key_prop='GEOID',
            map_props={
                # SVI2018_US.csv
                'RPL_THEMES': 'svi_rank', # percentile ranking
            },
            api_props={
                # SVI2018_US.csv
                'E_TOTPOP': 'pop', # population estimate
                'SPL_THEMES': 'svi',

                # EJSCREEN
                'CANCER': 'cancer_risk',
                'RESP': 'resp_hazard_idx',
            },
            outkey='tracts',
            outfmt='geojsonl',
            merge_with=[df_svi, df_ej],
            compare_props=[
                'svi',
                'cancer_risk',
                'resp_hazard_idx'
            ])


def process_schools():
    # School points
    df = process_geodata('src/public_schools/Public_Schools.geojson',
            key_prop='NCESID',
            map_props=[],
            api_props=[
                'NAME',
                'ENROLLMENT',
                'ST_GRADE', # start grade
                'END_GRADE', # end grade
                'FT_TEACHER', # full time teachers
            ],
            outkey='public_schools',
            outfmt='geojsonl')

    df['COORDS'] = df['geometry'].apply(lambda x : [round(n, 3) for n in list(x.coords)[0]])
    df['NAME_ZIP'] = df[['NAME','ZIP']].apply(lambda x : '{} ({})'.format(x[0],x[1]), axis=1)
    search_lookup = df.set_index('NAME_ZIP')['COORDS'].to_dict()
    with open('gen/school_lookup.json', 'w') as f: json.dump(search_lookup, f)


def process_congressional_districts():
    # 116th (2018) Congressional district shapefile
    con_districts = gpd.read_file('src/congressional_districts/cb_2018_us_cd116_500k.shp')
    con_districts = con_districts[['GEOID', 'geometry']] # GEOID is STATEFP+CD116FP (i.e. State FIPS and Congressional District number)
    con_districts.to_file('gen/congressional_districts.geojsonl', driver='GeoJSONSeq')


def process_school_districts():
    # School district data
    # This is for 2017-2018 school year, though
    # the file is from 2021
    df_costs = pd.read_csv(
        'src/district_cost_database/DistrictCostDatabase_2021v1.csv',
        dtype={'leaid': str})
    df_costs['leaid'] = df_costs['leaid'].apply(lambda x: x.zfill(7))
    df_costs.set_index('leaid', inplace=True)

    # School district shapes
    # 2017-2018 school year
    # For variable meanings, refer to:
    # `districts/EDGE_SDBOUNDARIES_COMPOSITE_FILEDOC.pdf`
    process_geodata('src/school_districts/2018/schooldistrict_sy1718_tl18.shp',
            # The GEOID is consistent with the NCES LEAID
            # except in the case of pseudo-districts.
            key_prop='GEOID',
            map_props=[],
            api_props=[
                'NAME',

                # DistrictCostDatabase_2021v1.csv
                'ppcstot', # Actual spending per-pupil
                'predcost', # Required (adequate) spending per-pupil
                'fundinggap', # Gap between actual and required spending per-pupil,
                'outcomegap', # Gap between district and U.S. average test scores (s.d.)
                'enroll', # Total student enrollment
                'pov', # Census child (5-17 year old) poverty rate
                'iep', # Percent special education students
                'ell', # Percent English language learners
                'black', # Percent Black students
                'hisp' # Percent Hispanic students
            ],
            outkey='school_districts',
            outfmt='geojsonl',
            # Drop "fictitious" districts
            process_fn=lambda df: df[df['FUNCSTAT'] != 'F'],
            merge_with=[df_costs],
            compare_props=[
                'ppcstot',
                'fundinggap',
                'outcomegap',
                'pov',
            ])


if __name__ == '__main__':
    # process_tracts()
    # process_schools()
    # process_congressional_districts()
    process_school_districts()