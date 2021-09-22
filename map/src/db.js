// DB-like interface for fetching
// additional data about a district
class DB {
  constructor() {
    this._cache = {};
  }

  async query(key, id) {
    // Used cached data, if any
    if (!(key in this._cache)) {
      this._cache[key] = {};
    }
    if (!(id in this._cache[key])) {
      this._cache[key][id] = await this._getData(key, id);
    }
    return Promise.resolve(this._cache[key][id]);
  }

  async queries(key, ids) {
    return Promise.all(ids.map((id) => this.query(key, id)))
      .then((items) => items.reduce((acc, item, i) => {
        acc[ids[i]] = item;
        return acc;
      }, {}));
  }

  _getData(key, id) {
    let url = `assets/data/${key}/${id}.json`;
    return this._get(url);
  }

  _get(url) {
    return fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        method: 'GET',
      })
      .then(res => res.json())
      .catch(err => { console.log(err) });
  }
}

export default DB;
