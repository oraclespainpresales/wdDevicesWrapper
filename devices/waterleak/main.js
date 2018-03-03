"use strict";

const _ = require('lodash')
;

module.exports = function(l)
{
  const MODULE       = "WATERLEAK"
      , LOG          = l
      , MYDEVICEFILE = __dirname + '/' + DEVICEFILE
  ;
  let config = require('./config.json')
    , device = _.noop()
  ;

  return {
    init() {
      return new Promise((resolve, reject) => {
        LOG.info(MODULE, "In " + MODULE + " constructor!!");
        resolve();
      });
    },
    getDeviceFilename() {
      return MYDEVICEFILE;
    },
    getConfig() {
      return config;
    },
    setDevice(_device) {
      device = _device;
    },
    getDevice() {
      return device;
    },
    startListenDevice() {
      return new Promise((resolve, reject) => {
        LOG.verbose(MODULE, "Start polling for data...");
        resolve();
      });
    }
  }
}
