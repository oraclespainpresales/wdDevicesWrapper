"use strict";

const _ = require('lodash')
    , MailListener = require("mail-listener2-updated")
;

module.exports = function(l)
{
  const MODULE       = "MOTIONDETECTOR"
      , LOG          = l
      , MYDEVICEFILE = __dirname + '/' + DEVICEFILE
      , MAXRETRIES   = 999
      , DELAY        = 60
  ;
  let config = require('./config.json')
    , device = _.noop()
    , retries = 0
    , retryTimer = _.noop()
    , motionDetectorMailListener = _.noop()
  ;

  return {
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
    init() {
      return new Promise((resolve, reject) => {
        resolve();
      });
    },
    interest(o) {
      if (!o.data.from || !o.data.subject || !o.data.body) {
        return false;
      }
      if (o.data.from.toLowerCase() !== config.USERMAIL.toLowerCase()) {
        return false;
      }
      if (o.data.subject == config.WLSUBJECTPATTERN) {
        if (o.data.body.search(config.WLBODYPATTERN) == -1) {
          return false;
        }
        return true;
      }
    },
    sendEvent(o) {
      // Send to IoTCS
      if (device) {
        let vd = device.getIotVd(config.urn[0]);
        if (vd) {
          let alert = vd.createAlert(config.urnalert);
          if (alert) {
            alert.fields.timestamp = Date.now();
            alert.raise();
            LOG.info(MODULE, "IOTCS '%s' alert raised successfully", config.urn);
          } else {
            LOG.error(MODULE, "Unable to raise alert. Unable to create IoTCS alert for URN '%s'", config.urnalert);
          }
        } else {
          LOG.error(MODULE, "Unable to raise alert. Unable to obtain IoTCS virtual device for URN '%s'", config.urn);
        }
      } else {
        LOG.error(MODULE, "Unable to raise alert. Undefined IoTCS device");
      }
    }
  }
}
