'use strict';

const log = require('npmlog-ts')
    , fs = require('fs')
    , _ = require('lodash')
    , async = require('async')
    , Device = require('./device')
    , globals = require('./globals')()
    , dcl = require('./device-library.node')
;

log.timestamp = true;
log.level     = 'verbose';

let devices = [];

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
    log.info(PROCESS, "WEDO Domo - Device Handler - 1.0");
    log.info(PROCESS, "Author: Carlos Casares <carlos.casares@oracle.com>");
    next(null);
  },
  registerDevices: next => {
    // Register all available devices
    if (!fs.existsSync(DEVICES)) {
      // No "devices" subfolder. Cannot continue
      log.error(PROCESS, "No '%s' subfolder found. Aborting!", DEVICES);
      process.exit(-1);
    }
    async.eachSeries(fs.readdirSync(DEVICES), (name, nextDevice) => {
      const deviceFolder = './' + DEVICES + '/' + name + '/';
      validate(deviceFolder)
        .then( () => {
          var d = {
            name: name,
            device: require(deviceFolder + MAIN)(log)
          };
          validate(d.device)
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
        log.info(PROCESS, "All devices successfully registered (%d)", devices.length);
        next(null);
      }
    });
  },
  iot: next => {
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
                mainStatus = "ERRMOD";
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
          log.error("Error during initialization: " + err);
        } else {
          d.device.setDevice(dev);
          nextDevice(null);
        }
      });
    }, err => {
      if (err) {
        log.error(PROCESS, err);
      } else {
        log.info(PROCESS, "All registered devices successfully initialized in IoTCS");
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
  getData: next => {
    async.eachSeries(devices, (d, nextDevice) => {
      log.info(PROCESS, "Start gathering data from device '%s'", d.name.toUpperCase());
      d.device.startListenDevice()
        .then(() => { nextDevice(null) })
        .catch( err => { log.error(d.name.toUpperCase(), err); nextDevice(null) })
      ;
    }, err => {
      if (err) {
        log.error(PROCESS, err);
      } else {
        log.info(PROCESS, "All registered devices listening to data...");
        next(null);
      }
    });
  }
});

function validate(p) {
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
