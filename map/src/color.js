function hexToRGB(hex) {
  let h = parseInt(hex.substr(1), 16);
  return [
    ((h >> 16) & 255)/255,
    ((h >> 8) & 255)/255,
    (h & 255)/255
  ];
}

function stopToValue(stop, range) {
  return range[0] + (range[1] - range[0]) * stop;
}

function gradientToStyle(gradient, range, idx) {
  return Object.keys(gradient)
    .map((stop) => parseFloat(stop))
    .sort()
    .reduce((acc, stop) => {
      acc.push(stopToValue(stop, range));
      if (idx !== undefined) {
        acc.push(hexToRGB(gradient[stop])[idx]);
      } else {
        acc.push(gradient[stop]);
      }
      return acc;
    }, []);
}

export default {gradientToStyle};
