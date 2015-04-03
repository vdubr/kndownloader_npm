var ogr2ogr = require('ogr2ogr');
var fs = require('fs');

var MapitoKnDown = require('../')

//test:true => use local testData
// var knDown = MapitoKnDown({id:602191,format:'kml',test:true}).stream()
var knDown = MapitoKnDown({id:602191,format:'gml',projection:'EPSG:3857'}).stream()

var ws = fs.createWriteStream('data2.zip');

knDown.pipe(ws);
