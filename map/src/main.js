import DB from './db';
import color from './color';
import config from './config';
import consts from './consts';

mapboxgl.accessToken = config.MAPBOX_TOKEN;

const MIN_EXPORT_ZOOM = 7.5;
const export_button = document.querySelector('#map-export');
function exportAreaToCSV() {
  // Lower zooms slow things to a crawl
  // because of the amount of data that has to be requested
  if (!map.loaded()) {
    console.error('Map is not finished loading.');
    return;
  }

  if (map.getZoom() < MIN_EXPORT_ZOOM) {
    console.error('Zoom must be greater than 7.5 to export view as CSV.');
    return;
  }

  const features = groupFeaturesBySource(map.queryRenderedFeatures());
  Promise.all(Object.keys(features).map((k) => toRows(k, features[k]))).then((csvs) => {
    const zip = new JSZip();
    const dir = zip.folder('map_csv_export');
    csvs = Object.assign(...csvs);
    Object.keys(csvs).forEach((k) => {
      dir.file(`${k}.csv`, csvs[k].join('\n'));
    });

    zip.generateAsync({type:'blob'}).then(function(content) {
        saveAs(content, 'map_csv_export.zip');
    });
  });
}

function toRows(key, feats) {
  let spec = specs[key];
  if (spec.idKey) { // Use DB for extra data
    let ids = feats.map((f) => f['properties'][spec.idKey]);
    return db.queries(key, ids).then((items) => {
      let cols = [...Object.keys(feats[0]['properties']), ...Object.keys(items[ids[0]])];
      return {
        [key]: [cols].concat(feats.map((f) => {
          let props = f['properties'];
          let id = props[spec.idKey];
          let data = items[id];
          if (cols.length === 0) {
          }
          return Object.values(props).concat(Object.values(data));
        }))
      };
    });
  } else {
    let cols = [...Object.keys(feats[0]['properties'])];
    return Promise.resolve({
      [key]: [cols].concat(feats.map((f) => Object.values(f['properties'])))
    });
  }
}

const tooltip = document.getElementById(`map-tooltip`);
const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const db = new DB();

const conf = {
  container: `map`,
  style: 'mapbox://styles/frnsys/cksoy8q960qtn18qjp3fnn5tl',
  zoom: 5.8,
  maxZoom: 15,
  minZoom: 2,
  center: [-75.40770744775523, 42.8821336509194]
};

const sources = {
  'school_districts': {
    'type': 'vector',
    'url': `mapbox://frnsys.gnd4ps_school_districts__0_2`
  },
  'con_districts': {
    'type': 'vector',
    'url': `mapbox://frnsys.gnd4ps_con_districts__0_1`
  },
  'tracts': {
    'type': 'vector',
    'url': `mapbox://frnsys.gnd4ps_tracts__0_3`
  },
  'public_schools': {
    'type': 'vector',
    'url': `mapbox://frnsys.gnd4ps_public_schools__0_1`
  }
};

const propRange = [0, 1]; // Percentile
const propName = 'svi_rank';
const propColor = {
  0.0: '#34d354',
  1.0: '#d35434'
};
const paintFillColor = [
  'interpolate',
    ['linear'],
    ['get', propName]
  ].concat(color.gradientToStyle(propColor, propRange));

const dataLayerName = 'data';
const layers = [{
  'id': 'tracts',
  'type': 'fill',
  'source': 'tracts',
  'source-layer': dataLayerName,
  'paint': {
    'fill-color': [
      'case',
      ['boolean', ['feature-state', 'focus'], false],
        '#4064FB',
      paintFillColor
    ],

    // Fade-out feature outlines at low zooms
    'fill-outline-color': [
      'interpolate', ['linear'], ['zoom'], 5, 'rgba(0, 0, 0, 0)', 10, 'rgba(0,0,0,1)'
    ],
  }
}, {
  'id': 'public_schools',
  'type': 'circle',
  'source': 'public_schools',
  'source-layer': dataLayerName,
  'paint': {
    'circle-radius': 8,
    // Fade-out at low zooms
    'circle-color': [
      'interpolate', ['linear'], ['zoom'],
        5,  [
          'case',
          ['boolean', ['feature-state', 'focus'], false],
            '#4064FB',
          'rgba(0, 0, 0, 0)',
        ],
        10, [
          'case',
          ['boolean', ['feature-state', 'focus'], false],
            '#4064FB',
          'rgba(251,191,8,1)'
        ]
    ],
    'circle-stroke-opacity': [
      'interpolate', ['linear'], ['zoom'], 5, 0.0, 7, 1.0
    ],
    'circle-stroke-color': '#000000',
    'circle-stroke-width': 1,
  }
}, {
  'id': 'con_districts-outline',
  'type': 'line',
  'source': 'con_districts',
  'source-layer': dataLayerName,
  'paint': {
    'line-color': [
      'interpolate', ['linear'], ['zoom'], 5, 'rgba(0, 0, 0, 0)', 10, 'rgba(0,0,0,1)'
    ],
    'line-width': 2
  }
}, {
  'id': 'con_districts-labels',
  'type': 'symbol',
  'source': 'con_districts',
  'source-layer': dataLayerName,
  'layout': {
    'text-field': ['concat',
      ['get', ['slice', ['get', 'GEOID'], 0, 2], ['literal', consts.STATE_FIPS_ABBREV]],
      ['slice', ['get', 'GEOID'], 2]],
    'text-radial-offset': 0.5,
    'text-justify': 'auto',
    'text-size': 16
  },
  'paint': {
    'text-opacity': [
      'interpolate', ['linear'], ['zoom'], 2, 0.0, 10, 1.0
    ]
  }
}, {
  'id': 'con_districts',
  'type': 'fill',
  'source': 'con_districts',
  'source-layer': dataLayerName,
  'paint': {
    'fill-color': 'rgba(0,0,0,0)'
  }
}, {
  'id': 'school_districts',
  'type': 'fill',
  'source': 'school_districts',
  'source-layer': dataLayerName,
  'paint': {
    'fill-opacity': 0 // Just showing data
  }
}];

const map = new mapboxgl.Map(conf);
map.dragRotate.disable();
map.touchZoomRotate.disableRotation();
map.on('dragstart', () => {
  tooltip.style.display = 'none';
});

map.on('load', () => {
  Object.keys(sources).forEach((s) => {
    map.addSource(s, sources[s]);
  });

  layers.forEach((l) => {
    map.addLayer(l);
  });
});

function formatNum(v) {
  return v ? v.toFixed(2) : 'unavailable';
}

let focusedLock = false;
map.getContainer().addEventListener('keydown', (ev) => {
  if (ev.key == 'Escape') {
    focusedLock = false;
    mapTip.innerText = '';
    mapTip.style.display = 'none';
  }
});

function pctDiff(v, reverse) {
  let pct = (v * 100).toFixed(2);
  let sign = v >= 0 ? '+': ''; // "-" already shown
  let cls = 'neutral';
  if (v < 0) {
    cls = reverse ? 'good': 'bad';
  } else if (v > 0) {
    cls = reverse ? 'bad': 'good';
  }
  return `<span class="${cls}">${sign}${pct}%</span>`;
}

const specs = {
  'tracts': {
    idKey: 'GEOID',
    describe: (props, data) => {
      return `
        <div>Population: ${data['pop']}</div>
        <div>Air toxics cancer risk: ${formatNum(data['cancer_risk'])} ${pctDiff(data['cancer_risk__pct_diff'], true)}*</div>
        <div>Respiratory hazard index: ${formatNum(data['resp_hazard_idx'])} ${pctDiff(data['resp_hazard_idx__pct_diff'], true)}*</div>
        <div>SVI: ${formatNum(data['svi'])} ${pctDiff(data['svi__pct_diff'], true)}*</div>
        <div>SVI Rank: ${formatNum(props['svi_rank'])}</div>
        ${props['svi_rank'] > 2/3 ? '<div class="good flag">Eligible for free retrofits</div>' : ''}
      `;
    }
  },
  'public_schools': {
    idKey: 'NCESID',
    describe: (props, data) => {
      return `
        <h4>${data['NAME']}</h4>
        <div>Grades: ${data['ST_GRADE']}-${data['END_GRADE']}</div>
        <div>Enrollment: ${data['ENROLLMENT']}</div>
        <div>F/T Teachers: ${data['FT_TEACHER']}</div>
      `;
    }
  },
  'con_districts': {
    idKey: null,
    describe: (props) => {
      let state_fips = props['GEOID'].slice(0, 2);
      let district = props['GEOID'].slice(2);
      return `${consts.STATE_FIPS[state_fips]} ${district}`;
    }
  },
  'school_districts': {
    idKey: 'GEOID',
    describe: (props, data) => {
      return `
        <h4>${data['NAME']}</h4>
        <div>5-17yo poverty rate: ${(data['pov'] * 100).toFixed(1)}% ${pctDiff(data['pov__pct_diff'], true)}*</div>
        <div>Enrollment: ${data['enroll']}</div>
        <div>Spending/Pupil: ${formatter.format(data['ppcstot'])} ${pctDiff(data['ppcstot__pct_diff'], false)}*</div>
        <div>Req. Spending/Pupil: ${formatter.format(data['predcost'])}</div>
        <div>Funding Gap: ${formatter.format(data['fundinggap'])} ${pctDiff(data['fundinggap__pct_diff'], false)}*</div>
        <div>Outcome Gap: ${formatNum(data['outcomegap'])} ${pctDiff(data['outcomegap__pct_diff'], false)}*</div>
        <div>%Black: ${(data['black'] * 100).toFixed(1)}%</div>
        <div>%Hispanic: ${(data['hisp'] * 100).toFixed(1)}%</div>
        <div>%English Language Learners: ${(data['ell'] * 100).toFixed(1)}%</div>
        <div>%Special Ed: ${(data['iep'] * 100).toFixed(1)}%</div>`;
    }
  }
}

function describe(key, feats) {
  let spec = specs[key];
  if (spec.idKey) { // Use DB for extra data
    let ids = feats.map((f) => f['properties'][spec.idKey]);
    return db.queries(key, ids).then((items) => {
      return {
        [key]: `
          <h3>${key}</h3>
          <div class="items">
            ${feats.map((f) => {
              let id = f['properties'][spec.idKey];
              return `<div>${spec.describe(f['properties'], items[id] || {})}</div>`;
            }).join('<br />')}
          </div>
        `
      };
    });
  } else {
    return Promise.resolve({
      [key]: `
        <h3>${key}</h3>
        <div class="items">
          ${feats.map((f) => {
            return spec.describe(f['properties'], {});
          }).join('<br />')}
        </div>
      `
    });
  }
}

const infoBox = document.querySelector('#map-details .map-focused-info');

function describeFeatures(features) {
  focusFeatures(features);
  let descriptions = Object.keys(features).map((k) => describe(k, features[k]));
  Promise.all(descriptions).then((descs) => {
    descs = Object.assign(...descs);

    infoBox.innerHTML = `
      <div>
        <div>
          ${descs['con_districts'] || ''}
          ${descs['tracts'] || ''}
        </div>
        <div>
          ${descs['school_districts'] || ''}
        </div>
        ${descs['public_schools'] ? `<div>${descs['public_schools']}</div>` : ''}
      </div>
    `;
  });
}

let focusedFeatures = Object.keys(sources).reduce((acc, s) => {
  acc[s] = [];
  return acc;
}, {});
function focusFeatures(features) {
  Object.keys(sources).forEach((sourceId) => {
    let feats = features[sourceId] || [];
    focusedFeatures[sourceId].forEach((f) => {
      map.setFeatureState({
        source: sourceId,
        sourceLayer: dataLayerName,
        id: f.id
      }, {
        focus: false,
      });
    });
    feats.forEach((f) => {
      map.setFeatureState({
        source: sourceId,
        sourceLayer: dataLayerName,
        id: f.id
      }, {
        focus: true
      });
    });
    focusedFeatures[sourceId] = feats;
  });
}

const onMouseMove = (haveNew, features, ev) => {
  if (focusedLock) return;

  // Ignore at low zoom levels, gets really choppy
  if (map.getZoom() <= 5) return;

  if (Object.keys(features).length > 0) {
    // Positioning, adjust if overflow
    // TODO not using tooltip atm
    // tooltip.style.left = `${ev.originalEvent.offsetX+10}px`;
    // tooltip.style.top = `${ev.originalEvent.offsetY+10}px`;
    // tooltip.style.display = 'block';
    // let box = tooltip.getBoundingClientRect();
    // if (box.left + box.width > window.innerWidth) {
    //   tooltip.style.left = `${ev.originalEvent.offsetX-box.width-10}px`;
    // }
    // if (box.top + box.height > window.innerHeight) {
    //   tooltip.style.top = `${ev.originalEvent.offsetY-box.height-10}px`;
    // }
    // tooltip.innerHTML = 'hello';

    if (haveNew) {
      describeFeatures(features);
    }
  } else {
    tooltip.style.display = 'none';
  }
}

const mapTip = document.querySelector('.map-tip');
map.on('click', (e) => {
  let features = groupFeaturesBySource(map.queryRenderedFeatures(e.point));
  if (Object.keys(features).length > 0) {
    focusedLock = true;
    mapTip.style.display = 'block';
    mapTip.innerHTML = 'Locked onto <b style="color:#4064FB;">feature</b>, press <div class="button-tip">Esc</div> to release.';
  }
  describeFeatures(features);
});


function groupFeaturesBySource(features) {
  return features.reduce((acc, feat) => {
    let k = feat.source;
    if (k in sources) {
      if (!(k in acc)) {
        acc[k] = [];
      }
      acc[k].push(feat);
    }
    return acc;
  }, {});
}

// Cache current features under mouse
let featuresUnderMouse = {};
map.on('mousemove', (e) => {
  // Be conservative in running mousemove responses,
  // since it can be a big performance hit
  if (!map.isMoving() && !map.isZooming()) {
    let features = groupFeaturesBySource(map.queryRenderedFeatures(e.point));
    let haveNew = Object.keys(features).some((k) => {
      return features[k].filter(x => {
        return !featuresUnderMouse[k] || !featuresUnderMouse[k].has(x.id);
      }).length > 0;
    });
    if (haveNew) {
      featuresUnderMouse = Object.keys(features).reduce((acc, s) => {
        acc[s] = new Set(features[s].map((f) => f.id));
        return acc;
      }, {});
    }
    onMouseMove(haveNew, features, e);
  }
});

function canExport() {
  return map.getZoom() >= MIN_EXPORT_ZOOM && map.loaded();
}

map.on('zoom', (e) => {
  export_button.style.display = canExport() ? 'block' : 'none';
});
map.on('render', () => {
  export_button.style.display = canExport() ? 'block' : 'none';
});
export_button.addEventListener('click', exportAreaToCSV);

// TODO
// map.on('zoom', (e) => {
//   console.log(`Zoom: ${map.getZoom()}`);
//   const features = groupFeaturesBySource(map.queryRenderedFeatures());
//   console.log(features);
// });
// map.on('dragend', (e) => {
//   console.log(`Zoom: ${map.getZoom()}`);
//   const features = groupFeaturesBySource(map.queryRenderedFeatures());
//   console.log(features);
// });

// Reference
window.getCenter = () => map.getCenter();
window.getZoom = () => map.getZoom();
window.flyTo = (coords, zoom) => map.flyTo({
  center: coords,
  zoom
});