- Data processing code is in `data/`
    - Source and generated data files aren't included because of their size, but `data/src/readme.md` gives sources to get the data
    - Once you get the source data, run `data/process.py` to process into geojson and json files.
        - The geojson files are used in `data/make_tiles.sh` to generate the Mapbox tilesets.
            - Separate tilesets are generated for each layer (school districts, congressional districts, census tracts, public schools)
        - The json files are used for additional feature properties that don't need to be included in the tilesets. They are separated to keep the tilesets relatively small. The only data included in the tilesets should be those necessary to color the map.
- Map code is in `map/`
    - The most important file here is `map/src/main.js`. This initializes the map, its interactions, etc.

You'll need to add `map/src/config.js` with following contents (fill in your Mapbox token):

```js
export default {
  MAPBOX_TOKEN: '<your mapbox token>'
};
```