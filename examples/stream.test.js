var fs = require('fs');

// var MapitoKnDown = require('../')
var MapitoKnDown = require('../build/build/main.js').MapitoKnDown;

//test:true => use local testData
var knDown = MapitoKnDown(
  {
    id:617237,
    format:'GeoJSON',
    projection:'EPSG:4326',
    types:['boundary', 'parcel', 'zoning']
  }
).stream().pipe(fs.createWriteStream('data.zip'))
