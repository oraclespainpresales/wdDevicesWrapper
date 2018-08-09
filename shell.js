'use strict';
const log = require('npmlog-ts')
    , globals  = require('./globals')()
    , fs = require('fs')
    , _ = require('lodash')
    , async = require('async')
    , Device = require('./device')
    , dcl = require('./device-library.node')
;

log.timestamp = true;
log.level     = 'verbose';

// Main handlers registration - BEGIN
// Main error handler
process.on('uncaughtException', function (err) {
  console.log("Uncaught Exception: " + err);
  console.log("Uncaught Exception: " + err.stack);
});
process.on('SIGINT', function() {
  log.info(PROCESS, "Caught interrupt signal");
  log.info(PROCESS, "Exiting gracefully");
  process.removeAllListeners()
  if (typeof err != 'undefined')
    log.error(PROCESS, err)
  process.exit(2);
});
// Main handlers registration - END

let devices    = []
  , collectors = []
;

// IoTCS helpers BEGIN
function getModel(device, urn, callback) {
  device.getDeviceModel(urn, function (response, error) {
    if (error) {
      callback(error);
    }
    callback(null, response);
  });
}
// IoTCS helpers END

async.series( {
  splash: next => {
    log.info(PROCESS, "WEDO Domo - Device Handler - " + VERSION);
    log.info(PROCESS, "Author: Carlos Casares <carlos.casares@oracle.com>");
    next(null);
  },
  registerCollectors: next => {
    // Register all available data collectors
    if (!fs.existsSync(COLLECTORS)) {
      // No "COLLECTORS" subfolder. Cannot continue
      log.error(PROCESS, "No '%s' subfolder found. Aborting!", COLLECTORS);
      process.exit(-1);
    }
    async.eachSeries(fs.readdirSync(COLLECTORS), (name, nextCollector) => {
      const collectorFolder = './' + COLLECTORS + '/' + name + '/';
      validateCollector(collectorFolder)
        .then( () => {
          var c = {
            name: name,
            collector: require(collectorFolder + MAIN)(log)
          };
          validateCollector(c.collector)
            .then (() => {
              log.verbose(name.toUpperCase(), "Collector '%s' successfully validated", name);
              collectors.push(c);
              nextCollector(null);
            })
            .catch(error => { log.error(name.toUpperCase(), error); nextCollector(null); })
          ;
        })
        .catch(error => { log.error(name.toUpperCase(), error); nextCollector(null); })
      ;
    }, err => {
      if (err) {
        log.error(PROCESS, err);
      } else {
        if (collectors.length == 0) {
          next("No collectors registered. Aborting.");
        } else {
          log.info(PROCESS, "All collectors successfully registered (%d)", collectors.length);
          next(null);
        }
      }
    });
  },
  registerDevices: next => {
    // Register all available devices
    if (!fs.existsSync(DEVICES)) {
      // No "DEVICES" subfolder. Cannot continue
      log.error(PROCESS, "No '%s' subfolder found. Aborting!", DEVICES);
      process.exit(-1);
    }
    async.eachSeries(fs.readdirSync(DEVICES), (name, nextDevice) => {
      const deviceFolder = './' + DEVICES + '/' + name + '/';
      validateDevice(deviceFolder)
        .then( () => {
          var d = {
            name: name,
            device: require(deviceFolder + MAIN)(log)
          };
          validateDevice(d.device)
            .then (() => {
              log.verbose(name.toUpperCase(), "Device '%s' successfully validated", name);
              devices.push(d);
              nextDevice(null);
            })
            .catch(error => { log.error(name.toUpperCase(), error); nextDevice(null); })
          ;
        })
        .catch(error => { log.error(name.toUpperCase(), error); nextDevice(null); })
      ;
    }, err => {
      if (err) {
        log.error(PROCESS, err);
      } else {
        if (devices.length == 0) {
          next("No devices registered. Aborting.");
        } else {
          log.info(PROCESS, "All devices successfully registered (%d)", devices.length);
          next(null);
        }
      }
    });
  },
  iot: next => {
    // Go through all existing devices to "start" them
    async.eachSeries(devices, (d, nextDevice) => {
      var dev = new Device(d.name.toUpperCase(), log);
      dev.setStoreFile(d.device.getDeviceFilename(), d.device.getConfig().storePassword);
      dev.setUrn(d.device.getConfig().urn);
      async.series( {
        initialize: go => {
          log.info(IOTCS, "Initializing IoT device '" + dev.getName() + "'");
          dev.setIotDcd(new dcl.device.DirectlyConnectedDevice(dev.getIotStoreFile(), dev.getIotStorePassword()));
          go(null);
        },
        activate: go => {
          // Check if already activated. If not, activate it
          if (!dev.getIotDcd().isActivated()) {
            log.verbose(IOTCS, "Activating IoT device '" + dev.getName() + "'");
            dev.getIotDcd().activate(dev.getUrn(), function (_device, error) {
              if (error) {
                log.error(IOTCS, "Error in activating '" + dev.getName() + "' device (" + dev.getUrn() + "). Error: " + error.message);
                go(error);
              } else {
                dev.setIotDcd(_device);
                if (!dev.getIotDcd().isActivated()) {
                  log.error(IOTCS, "Device '" + dev.getName() + "' successfully activated, but not marked as Active (?). Aborting.");
                  go("ERROR: Successfully activated but not marked as Active");
                }
                go(null);
              }
            });
          } else {
            log.verbose(IOTCS, "'" + dev.getName() + "' device is already activated");
            go(null);
          }
        },
        getmodels: go => {
          // When here, the device should be activated. Get device models, one per URN registered
          async.eachSeries(dev.getUrn(), (urn, nextUrn) => {
            getModel(dev.getIotDcd(), urn, ((error, model) => {
              if (error !== null) {
                log.error(IOTCS, "Error in retrieving '" + urn + "' model. Error: " + error.message);
                nextUrn(error);
              } else {
                dev.setIotVd(urn, model, dev.getIotDcd().createVirtualDevice(dev.getIotDcd().getEndpointId(), model));
                log.verbose(IOTCS, "'" + urn + "' intialized successfully");
              }
              nextUrn(null);
            }).bind(this));
          }, function(err) {
            if (err) {
              go(err);
            } else {
              go(null, true);
            }
          });
        }
      }, (err, results) => {
        if (err) {
          log.error(IOTCS, "Error during initialization: " + err);
          nextDevice(err);
        } else {
          d.device.setDevice(dev);
          nextDevice(null);
        }
      });
    }, err => {
      if (err) {
        log.error(PROCESS, err);
        next(err);
      } else {
        log.info(PROCESS, "All registered devices successfully initialized in IoTCS.");
        next(null);
      }
    });
  },
  initCollectors: next => {
    async.eachSeries(collectors, (c, nextCollector) => {
      c.collector.init()
        .then(() => { nextCollector(null) })
        .catch( err => { log.error(c.name.toUpperCase(), err); nextCollector(null) })
      ;
    }, err => {
      if (err) {
        log.error(PROCESS, err);
        next(err);
      } else {
        log.info(PROCESS, "All registered collectors successfully initialized");
        next(null);
      }
    });
  },
  initDevices: next => {
    async.eachSeries(devices, (d, nextDevice) => {
      d.device.init()
        .then(() => { nextDevice(null) })
        .catch( err => { log.error(d.name.toUpperCase(), err); nextDevice(null) })
      ;
    }, err => {
      if (err) {
        log.error(PROCESS, err);
      } else {
        log.info(PROCESS, "All registered devices successfully initialized");
        next(null);
      }
    });
  },
  startCollectors: next => {
    async.eachSeries(collectors, (c, nextCollector) => {
      c.collector.setDevices(devices);
      c.collector.start()
        .then(() => { nextCollector(null) })
        .catch( err => { log.error(c.name.toUpperCase(), err); nextCollector(null) })
      ;
    }, err => {
      if (err) {
        log.error(PROCESS, err);
        next(err);
      } else {
        log.info(PROCESS, "All registered collectors successfully started");
        next(null);
      }
    });
  }
}, err => {
  if (err) {
    log.error(PROCESS, err);
  }
});

function validateCollector(p) {
  if ( _.isString(p)) {
    // Checking subfolder mandatory files
    return new Promise((resolve, reject) => {
      _.each(COLLECTORFILES, f => {
        if (!fs.existsSync(p + f)) {
          reject("Invalid collector folder. File '" + f + "' is missing. Ignoring collector.");
        }
      });
      resolve();
    });
  } else if (_.isObject(p)) {
    // Checking mandatory methods
    return new Promise((resolve, reject) => {
      _.each(COLLECTORMETHODS, m => {
        if (typeof p[m] !== 'function') {
          reject("Invalid collector. Method '" + m + "()' is missing. Ignoring collector.");
        }
      });
      resolve();
    });
  }
}

function validateDevice(p) {
  if ( _.isString(p)) {
    // Checking subfolder mandatory files
    return new Promise((resolve, reject) => {
      _.each(DEVICEFILES, f => {
        if (!fs.existsSync(p + f)) {
          reject("Invalid device folder. File '" + f + "' is missing. Ignoring device.");
        }
      });
      resolve();
    });
  } else if (_.isObject(p)) {
    // Checking mandatory methods
    return new Promise((resolve, reject) => {
      _.each(DEVICEMETHODS, m => {
        if (typeof p[m] !== 'function') {
          reject("Invalid device handler. Method '" + m + "()' is missing. Ignoring device.");
        }
      });
      resolve();
    });
  }
}
