'use strict';
//arguments
// node transform.js 600016 EPSG:900913 KML
//1) cadastre id
//2) output srs
//3) output format [shp,kml,gml]

//fixjsstyle index.js --strict --jslint_error=all
//gjslint index.js --strict --jslint_error=all

var archiver = require('archiver');
var EE = require('events').EventEmitter;
var exec = require('child_process').exec;
var fs = require('fs');
var ogr2ogr = require('ogr2ogr');
var request = require('request');
var rimraf = require('rimraf');
var stream = require('stream');
var unzip = require('unzip');




/**
  * export
  */
module.exports = MapitoKnDown;

/**
 * @enum {string}
 */
var formats = {
  SHP: 'shp',
  KML: 'kml',
  GML: 'gml'
};


/**
 * @typedef {Object}
 * @param {!number} id Id of cadastre to transform
 * @param {?formats} format One of output format
 * @param {?string} projection Epsg code
 * @param {?string} test Run test
 */
var options;

/**
 * @param {!options} options
 * @constructor
 */
function MapitoKnDown(options) {
  if (!(this instanceof MapitoKnDown)) {
    return new MapitoKnDown(options);
  }

  /**
   * 24 hours
   * older directory are deleted
   * @type {number}
   * @private
   */
  this.stream_ = new stream.PassThrough();

  /**
   * @type {?number}
   * @private
   */
  this.layerCount_ = null;

  /**
   * 24 hours
   * older directory are deleted
   * @type {number}
   * @private
   */
  this.maxAge_ = 86400000;

  /**
   * @type {boolean}
   * @private
   */
  this.test_ = options.test || false;

  /**
   * @type {string}
   * @private
   */
  this.testPath_ = './testData/';

  if (options && options.id) {
    var knId = options.id;
  }else {
    throw new Error('KN id is required');
  }

  /**
   * @type {number}
   * @private
   */
  this.knId_ = knId;

  console.log('Transform cadastre: ' + this.knId_);

  /**
   * Proj4 EPSG:5514 definition
   * @type {string}
   * @private
   */
   this.krovak_ = '+proj=krovak +lat_0=49.5 +lon_0=24.83333333333333 +alpha=30.28813972222222 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=542.5,89.2,456.9,5.517,2.275,5.516,6.96 +pm=greenwich +units=m +no_defs';

  /**
   * URL where is stored kn gml data in EPSG:5514
   * @type {string}
   * @private
   */
  this.baseUrl_ = 'http://services.cuzk.cz/gml/inspire/cp/epsg-5514/';


  /**
   * @type {string}
   * @private
   */
  this.outputSrs_ = this.krovak_;
  if (options && options.projection && (options.projection !== 'EPSG:5514')) {
      this.outputSrs_ = options.projection;
  }
  console.log('Transform to projection: ' + this.outputSrs_);


  //set output format
  var format = 'shp';
  if (options && options.format) {
    format = options.format;
  }

  /**
   * @type {string}
   * @private
   */
  this.outputFormat_ = this.getFormat_(format);

  console.log('Transform to format: ' + this.outputFormat_);

  /**
   * @type {string}
   * @private
   */
  this.outputSuffix_ = this.getSuffix_(this.outputFormat_);

  //create timestamp
  var date = new Date();
  var timeStamp = date.getTime();

  /**
   * @type {string}
   * @private
   */
  this.folderId_ = this.knId_ + '_' + timeStamp;

  /**
   * @type {string}
   * @private
   */
  this.dataPath_ = './data/';


  /**
   * @type {string}
   * @private
   */
  this.basePath_ = this.dataPath_ + this.folderId_;

}

MapitoKnDown.prototype = Object.create(EE.prototype);


/**
 * Save kn results to directory
 */
MapitoKnDown.prototype.save = function() {
  this.checkFolderStructure_();
  this.stream_.on('compressed', function() {
    console.log('path://' + this.basePath_ + '/data.zip')}.bind(this));
  this.run_().pipe(fs.createWriteStream(this.basePath_ + '/data.zip'));
};


/**
 * @return {Stream}
 */
MapitoKnDown.prototype.stream = function() {
  this.checkFolderStructure_();
  return this.run_();
};

/**
 * @return {Stream}
 * @private
 */
MapitoKnDown.prototype.run_ = function() {

  this.downloadKnData_();

  this.stream_.on('compressed', this.clear_.bind(this));

  return this.stream_;
};


/**
 * @private
 */
MapitoKnDown.prototype.clear_ = function() {
  this.clearDirectory_();
  this.clearOlderDirectories_();
};


/**
 * @private
 */
MapitoKnDown.prototype.clearDirectory_ = function() {

  var toRemove = ['/extract', '/output', '/kn.zip'];

  toRemove.forEach(function(dir) {
    rimraf(this.basePath_ + dir, function(err) {});
  }.bind(this));
};

/**
 * @private
 */
MapitoKnDown.prototype.clearOlderDirectories_ = function() {
  var directories = fs.readdirSync(this.dataPath_);

  directories.forEach(this.removeDirIfIsOlder_.bind(this));

};



/**
 * @private
 */
MapitoKnDown.prototype.compressTransformedFiles_ = function() {
  var zipArchive = archiver('zip');

    zipArchive.on('end', function() {
      this.stream_.emit('compressed');
    }.bind(this));

    zipArchive.pipe(this.stream_);

    var sourceDir = this.basePath_ + '/output/';

    zipArchive.bulk([
      {
        src: ['**/*'],
        cwd: sourceDir,
        expand: true
      }
    ]);

zipArchive.finalize(function(er) {
  if (er) {
    console.log('error in archive');
  }
  console.log('archive is ok');
});
};

/**
 * @private
 */
 MapitoKnDown.prototype.createBaseFolder_ = function() {
   //check if exists base folder
   if (!fs.existsSync(this.basePath_)) {
       fs.mkdirSync(this.basePath_);
   }
 };

/**
 * @private
 */
MapitoKnDown.prototype.downloadKnData_ = function() {

  if (!this.test_) {
    var url = this.baseUrl_ + this.knId_ + '.zip';
    var downloadReq = request.get(url);

    //handle download end, save result to folder
    downloadReq.on('response', this.onDownloadFinish_.bind(this));

  }else {
    var read = fs.createReadStream(this.testPath_ + this.knId_ + '.zip');



    read.pipe(fs.createWriteStream(this.basePath_ + '/kn.zip')
      .on('finish', this.unzipAndTranfer_.bind(this)));
  }
  };

/**
 * @param {formats} format
 * @return {string}
 * @private
 */
MapitoKnDown.prototype.getFormat_ = function(format) {
  var checkFormat = '';
  var containValue = false;

  for (var i in formats) {
      if (formats[i] === format) {
        containValue = true;
      }
  }

  if (!containValue) {
    throw new Error('Given format is not supported');
  }

  if (format === 'shp') {
    checkFormat = 'ESRI Shapefile';
  }else {
    checkFormat = format;
  }
  return checkFormat;
};


/**
 * @param {string} knFilePath path to XML file
 * @private
 */
 MapitoKnDown.prototype.getLayers_ = function(knFilePath) {
  // executes `ogrinfo`
  var child = exec('ogrinfo -ro -so ' + knFilePath,
    this.onOgrInfoReady_.bind(this));
};

/**
 * @param {formats} format
 * @return {string}
 * @private
 */
MapitoKnDown.prototype.getSuffix_ = function(format) {
  var suffix;
  switch (format) {
    case 'ESRI Shapefile':
      suffix = 'zip';
      break;
    default:
      suffix = format;
      break;
  }
  return suffix;
};


/**
 * @private
 */
 MapitoKnDown.prototype.checkDataFolder_ = function() {
   //check if exests data folde
   if (!fs.existsSync(this.dataPath_)) {
       fs.mkdirSync(this.dataPath_);
   }
 };

/**
 * @private
 */
 MapitoKnDown.prototype.checkFolderStructure_ = function() {
   this.checkDataFolder_();
   this.createBaseFolder_();
 };


/**
 * @private
 */
 MapitoKnDown.prototype.checkLastTransformLayer_ = function() {
   this.layerCount_ = this.layerCount_ - 1;

   if (this.layerCount_ === 0) {
     this.onLastLayerTransform_();
   }
 };

/**
 * @param {Object} response
 * @private
 */
 MapitoKnDown.prototype.onDownloadFinish_ = function(response) {
  response.pipe(fs.createWriteStream(this.basePath_ + '/kn.zip')
    .on('finish', this.unzipAndTranfer_.bind(this)));
 };

/**
 * @private
 */
 MapitoKnDown.prototype.onLastLayerTransform_ = function() {
   this.compressTransformedFiles_();
 };

/**
 * @param {string} error
 * @param {string} stdout
 * @param {string} stderr
 * @private
 */
 MapitoKnDown.prototype.onOgrInfoReady_ = function(error, stdout, stderr) {
   var layerTypes = ['CadastralZoning', 'CadastralParcel', 'CadastralBoundary'];
   var layers = [];
   var lines = stdout.split(/\n/g);
   var line, layerId, layerType;
   for (var i = 2; i < lines.length; i++) {
     line = lines[i];
     layerId = parseInt(line[0]);
     if (line.length > 3 && layerId) {
       //get layer name
       layerType = line.split(' ')[1];
       if (layerTypes.indexOf(layerType) > -1) {
         layers.push({
           id: layerId,
           type: layerType
         });
       }
     }
   }

   this.layerCount_ = layers.length;
   this.transformLayers_(layers);
 };

 /**
  * @param {string} directory
  * @private
  */
MapitoKnDown.prototype.removeDirIfIsOlder_ = function(directory) {
    var spl = directory.split('_');
    if (spl.length === 2) {
      var dirTime = spl[1];
      var curTime = new Date();
      var timeDifference = curTime - dirTime;
      if (timeDifference > this.maxAge_) {
        rimraf(this.dataPath_ + directory, function(err) {
              console.log('done delete');
          });
      }
    }else {
      rimraf(this.dataPath_ + directory, function(err) {
            console.log('done delete');
        });
    }

};

 /**
  * @private
  */
MapitoKnDown.prototype.transformData_ = function() {
    var knFilePath = this.basePath_ + '/extract/' + this.knId_ + '.xml';
    var layers = this.getLayers_(knFilePath);
};

/**
 * @param {Array.<Object>} layers Object contains id and type
 * @private
 */
 MapitoKnDown.prototype.transformLayers_ = function(layers) {
  var knFilePath = this.basePath_ + '/extract/' + this.knId_ + '.xml';
  var id, name, outputFilePath;

  fs.mkdirSync(this.basePath_ + '/output/');

  for (var i = 0; i < layers.length; i++) {
    name = layers[i]['type'];
    outputFilePath = this.basePath_ + '/output/' + name + '.' +
    this.outputSuffix_;

    this.transformLayer_(knFilePath, outputFilePath, name);
  }
};


/**
 * @param {string} knFilePath
 * @param {string} outputFilePath
 * @param {string} layerName
 * @private
 */
 MapitoKnDown.prototype.transformLayer_ = function(
   knFilePath, outputFilePath, layerName) {
  var output = ogr2ogr(knFilePath)
                      .format(this.outputFormat_)
                      .skipfailures()
                      .project(this.outputSrs_, this.krovak_)
                      .options([outputFilePath, layerName])
                      .stream();

  var ws = fs.createWriteStream(outputFilePath);

  ws.on('finish', this.checkLastTransformLayer_.bind(this));

  output.pipe(ws);
};


/**
 * @private
 */
MapitoKnDown.prototype.unzipAndTranfer_ = function() {
  fs.createReadStream(this.basePath_ + '/kn.zip')
    .pipe(unzip.Extract({ path: this.basePath_ + '/extract' }))
    .on('close', this.transformData_.bind(this));
};
