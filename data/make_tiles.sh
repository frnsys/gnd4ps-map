#!/bin/bash

function makeTiles() {
    echo "Generating tiles for '${1}'"
    # Clean up
    output="gen/${1}.mbtiles"
    rm "$output"

    # -P = process in parallel from a geojsonl file
    # -S = simplify geometry, doc says up to 10 should have little visible difference
    # -D = detail at lower zoom levels
    # -z = max zoom, set to 10 or lower or get hit with high tileset processing costs,
    #       see <https://docs.mapbox.com/mapbox-tiling-service/guides/pricing/>
    tippecanoe -l "data" -o "$output" -P -z10 --coalesce-densest-as-needed --hilbert --extend-zooms-if-still-dropping --generate-ids --detect-shared-borders -S 10 -D 11 "gen/${1}.geojsonl"
}

makeTiles "school_districts"
# makeTiles "congressional_districts"
makeTiles "tracts"
# makeTiles "public_schools"