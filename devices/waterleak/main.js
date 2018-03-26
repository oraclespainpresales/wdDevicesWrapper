"use strict";

const _ = require('lodash')
    , MailListener = require("mail-listener-fixed")
;

module.exports = function(l)
{
  const MODULE       = "WATERLEAK"
      , LOG          = l
      , MYDEVICEFILE = __dirname + '/' + DEVICEFILE
      , MAXRETRIES   = 999
      , DELAY        = 60
  ;
  let config = require('./config.json')
    , device = _.noop()
    , retries = 0
    , retryTimer = _.noop()
    , waterLeakMailListener = _.noop()
  ;

  function eventsHandler() {
    if (!waterLeakMailListener) return;
    waterLeakMailListener.on("server:connected", () => {
      LOG.verbose(MODULE, "'%s' server connected with username '%s'", config.HOSTLISTENER, config.USERMAIL);
      if (retryTimer) {
        clearInternal(retryTimer);
        retryTimer = _.noop();
        retries = 0;
      }
    });
    waterLeakMailListener.on("server:disconnected", () => {
      LOG.verbose(MODULE, "'%s' server disconnected", config.HOSTLISTENER);
      waterLeakMailListener.stop();
      if (!retryTimer) {
        retries = MAXRETRIES;
        retryTimer = setInterval(() => {
          LOG.verbose(MODULE, "Retrying... (left %d)", retries);
          waterLeakMailListener.start();
          retries--;
          if (retries == 0) {
            LOG.verbose(MODULE, "MAX retries reached. Aborting.");
            clearInternal(retryTimer);
          }
        }, DELAY * 1000);
      }
    });
    waterLeakMailListener.on("error", err => {
      LOG.error(MODULE, err);
    });
    waterLeakMailListener.on("mail", (mail, seqno, attributes) => {
      if (mail.subject == config.WLSUBJECTPATTERN){
        /*
        LOG.verbose(MODULE, "Subject::::::: " + mail.subject);
        LOG.verbose(MODULE, "messageId::::::: " + mail.messageId);
        LOG.verbose(MODULE, "from::::::: " + mail.from[0].address + " - " + mail.from[0].name);
        */
				let pos = mail.html.search(config.WLBODYPATTERN);
				if (pos == -1) {
					LOG.verbose(MODULE, "Pattern '" +  config.WLBODYPATTERN + "' not found in email");
				} else {
          LOG.info(MODULE, "New %s mail", MODULE);
          let split = mail.html.substring(pos, pos +  config.WLMESSAGELENGTH).split(" ");
          let date = split[14] + "%20" + split[15] + "%20" + split[16];
          let time = split[12];
          // Send to IoTCS
          if (device) {
            let vd = device.getIotVd(config.urn[0]);
            if (vd) {
              let alert = vd.createAlert(config.urnalert);
              if (alert) {
                alert.fields.timestamp = Date.now();
                alert.fields.subject   = mail.subject;
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
      } else {
        LOG.verbose(MODULE, "Not a Water Leakage detection message. Ignoring.");
      }
    });
  }

  return {
    init() {
      return new Promise((resolve, reject) => {
        LOG.info(MODULE, "Initializing Waterleak data gathering device");
        // Construction of mail listener object
        waterLeakMailListener = new MailListener({
          username: config.USERMAIL,
          password: config.PASSWORD,
          host: config.HOSTLISTENER,
          port: config.PORT, // imap port
          tls: config.TLS,
          connTimeout: config.CNXTIMEOUT, // Default by node-imap
          authTimeout: config.AUTHTIMEOUT, // Default by node-imap,
          debug: null, //console.log, // Or your custom function with only one incoming argument. Default: null
          tlsOptions: { rejectUnauthorized: false },
          mailbox: config.MAILBOX, // mailbox to monitor
          searchFilter: ["UNSEEN"], // the search filter being used after an IDLE notification has been retrieved
          markSeen: true, // all fetched email willbe marked as seen and not fetched next time
          fetchUnreadOnStart: false, // use it only if you want to get all unread email on lib start. Default is `false`,
          mailParserOptions: {streamAttachments: true}, // options to be passed to mailParser lib.
          attachments: true, // download attachments as they are encountered to the project directory
          attachmentOptions: { directory: "attachments/" } // specify a download directory for attachments
        });
        // Set event handlers
        eventsHandler();
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
        waterLeakMailListener.start();
        resolve();
      });
    },
    stopListenDevice() {
      return new Promise((resolve, reject) => {
        LOG.verbose(MODULE, "Stop polling for data...");
        waterLeakMailListener.stop();
        resolve();
      });
    }
  }
}
