module.exports = function() {

  // Global variables
  global.VERSION          = 'v2.0';
  global.PROCESS          = 'MAIN';
  global.IOTCS            = "IOTCS";
  global.COLLECTORS       = 'collectors';
  global.DEVICES          = 'devices';
  global.MAIN             = 'main';
  global.DEVICEFILE       = 'device.conf';
  global.CONFIGFILE       = 'config.json';
  global.COLLECTORFILES   = [ 'main.js', CONFIGFILE ];
  global.DEVICEFILES      = [ 'main.js', DEVICEFILE, CONFIGFILE ];
//  global.DEVICEMETHODS = [ 'init', 'getDeviceFilename', 'getConfig', 'setDevice', 'getDevice', 'startListenDevice', 'stopListenDevice' ];
  global.COLLECTORMETHODS = [ 'init', 'setDevices', 'getDevices', 'start', 'stop', 'restart' ];
  global.DEVICEMETHODS = [ 'init', 'getDeviceFilename', 'getConfig', 'setDevice', 'getDevice', 'interest', 'sendEvent' ];

}
