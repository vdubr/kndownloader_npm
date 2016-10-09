var MapitoKnDown = require('../')

//only save and show url
var knDown = MapitoKnDown({
  id:617237,
  format:'GeoJSON', //shp
  projection:'EPSG:4326',
  types:['parcel']
}).save()
