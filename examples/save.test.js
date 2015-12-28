var MapitoKnDown = require('../')

// var knDown = MapitoKnDown({id:602191,format:'kml',test:true}).save()
// var knDown = MapitoKnDown({id:617237,format:'shp',projection:'EPSG:5514'}).save()
var knDown = MapitoKnDown({id:617237,format:'shp',projection:'EPSG:4326'}).save()
