"use strict";

const _ = require('lodash')
    , restify = require('restify-clients')
    , async = require('async')
    , MailListener = require("mail-listener2-updated")
    , util = require("util")
;

module.exports = function(l)
{
  const MODULE       = "MAILCOLLECTOR"
      , LOG          = l
      , DEMOZONESURI = "/ords/pdb1/wedodomo/domo/getDemozone"
      , SETUPURI     = "/ords/pdb1/wedodomo/domo/getParameter/{demozone}/mail"
  ;
  let config = require('./config.json')
    , device = _.noop()
    , retries = 0
    , retryTimer = _.noop()
    , motionDetectorMailListener = _.noop()
    , demozones = _.noop()
    , devices = _.noop()
  ;

  let apex = restify.createJsonClient({
    url: 'https://' + config.apex,
    rejectUnauthorized: false,
    headers: {
      "content-type": "application/json"
    }
  });

  function registerEventsHandlers(demozone, s) {
    if (!s.server) { return }
    s.server.on("server:connected", () => {
      LOG.verbose(MODULE, "'%s' server connected with username '%s'", s.config.HOSTLISTENER, s.config.USERMAIL);
    });
    s.server.on("server:disconnected", () => {
      LOG.verbose(MODULE, "'%s' server disconnected", s.config.HOSTLISTENER);
      LOG.verbose(MODULE, "Trying to restart connection...");
      s.server.restart();
    });
    s.server.on("error", err => {
      LOG.error(MODULE, err);
    });
    s.server.on("mail", (mail, seqno, attributes) => {
      LOG.verbose(demozone + "-" + s.name, "Mail " + mail.subject);
      var queryInterestObject = {
        collector: MODULE,
        demozone: demozone,
        data: {
          from: mail.to[0].address,
          subject: mail.subject,
          body: mail.html
        }
      };
      async.each(devices, (d, next) => {
        if (d.device.interest(queryInterestObject)) {
          d.device.sendEvent(queryInterestObject);
        }
      }, err => {
        if (err) {
        } else {
        }
      });
    });
  }

  return {
    init() {
      return new Promise((resolve, reject) => {
        LOG.info(MODULE, "Initializing %s data gathering collector", MODULE);

        async.series( {
          getDemozones: next => {
            // Get all current demozones
            apex.get(DEMOZONESURI, function(err, req, res, obj) {
              var jBody = JSON.parse(res.body);
              if (err) {
                next(err.message);
              } else if (!jBody.items || jBody.items.length == 0) {
                next("No demozones found. Aborting.");
              } else {
                demozones = jBody.items;
                next(null);
              }
            });
          },
          getMailSetup: next => {
            async.each(demozones, (d, nextDemozone) => {
              // Get mail setup for each demozone and push it on the array element
              let mailServers = _.noop();
              apex.get(SETUPURI.replace("{demozone}", d.demozone), function(err, req, res, obj) {
                if (err) {
                  if (res.statusCode !== 404) {
                    n("Error retrieving setup for '%s': %d", d.demozone, res.statusCode);
                  } else {
                    // We ignore the error and keep going with next demozone
                    LOG.verbose(MODULE, "Ignoring demozone %s as no setup found for it.", d.demozone);
                    nextDemozone();
                  }
                } else {
                  var jBody = JSON.parse(res.body);
                  if (!jBody.paramdesc) {
                    LOG.error(MODULE, "Ignoring demozone %s as invalid setup found for it.", d.demozone);
                    nextDemozone();
                  } else {
                    mailServers = JSON.parse(jBody.paramdesc);
                    d.mailServers = mailServers;
                    nextDemozone();
                  }
                }
              });
            }, err => {
              if (err) {
                reject(err);
              } else {
                next();
              }
            });
          },
          initMailConnections: next => {
            async.each(demozones, (d, nextDemozone) => {
              if (d.mailServers) {
                async.each(d.mailServers, (s, nextMailServer) => {
                  LOG.verbose(MODULE, "Initializing server '%s', for demozone '%s'", s.name, d.demozone);
                  s.server = new MailListener({
                    username: s.config.USERMAIL,
                    password: s.config.PASSWORD,
                    host: s.config.HOSTLISTENER,
                    port: s.config.PORT, // imap port
                    tls: s.config.TLS,
                    connTimeout: s.config.CNXTIMEOUT, // Default by node-imap
                    authTimeout: s.config.AUTHTIMEOUT, // Default by node-imap,
                    debug: null, //console.log, // Or your custom function with only one incoming argument. Default: null
                    tlsOptions: { rejectUnauthorized: false },
                    mailbox: s.config.MAILBOX, // mailbox to monitor
                    searchFilter: ["UNSEEN"], // the search filter being used after an IDLE notification has been retrieved
                    markSeen: true, // all fetched email willbe marked as seen and not fetched next time
                    fetchUnreadOnStart: false, // use it only if you want to get all unread email on lib start. Default is `false`,
                    mailParserOptions: {streamAttachments: true}, // options to be passed to mailParser lib.
                    attachments: true, // download attachments as they are encountered to the project directory
                    attachmentOptions: { directory: "attachments/" } // specify a download directory for attachments
                  });
                  registerEventsHandlers(d.demozone, s);
                  nextMailServer();
                }, err => {
                  nextDemozone();
                });
              } else {
                nextDemozone();
              }
            }, err => {
              if (err) {
                reject(err);
              } else {
                next();
              }
            });
          }
        }, err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
    getDeviceFilename() {
      return MYDEVICEFILE;
    },
    getConfig() {
      return config;
    },
    setDevices(_devices) {
      devices = _devices;
    },
    getDevices() {
      return devices;
    },
    start() {
      return new Promise((resolve, reject) => {
        LOG.verbose(MODULE, "Start gathering data...");
        async.each(demozones, (d, nextDemozone) => {
          if (d.mailServers) {
            async.each(d.mailServers, (s, nextMailServer) => {
              LOG.verbose(MODULE, "Starting to listen on server '%s', for demozone '%s'", s.name, d.demozone);
              s.server.start();
              nextMailServer();
            }, err => {
              nextDemozone();
            });
          } else {
            nextDemozone();
          }
        }, err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
    stop() {
      return new Promise((resolve, reject) => {
        LOG.verbose(MODULE, "Stop polling for data...");
        async.each(demozones, (d, nextDemozone) => {
          if (d.mailServers) {
            async.each(d.mailServers, (s, nextMailServer) => {
              LOG.verbose(MODULE, "Stopping listening on server '%s', for demozone '%s'", s.name, d.demozone);
              s.server.stop();
              nextMailServer();
            }, err => {
              nextDemozone();
            });
          } else {
            nextDemozone();
          }
        }, err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
    restart() {
      this.stop().then(this.start());
    }
  }
}
