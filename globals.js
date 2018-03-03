module.exports = function() {

  // Global variables
  global.VERSION       = 'v2.0.10';
  global.PROCESS       = 'MAIN';
  global.IOTCS         = "IOTCS";
  global.DEVICES       = 'devices';
  global.MAIN          = 'main';
  global.DEVICEFILE    = 'device.conf';
  global.CONFIGFILE    = 'config.json';
  global.DEVICEFILES   = [ 'main.js', DEVICEFILE, CONFIGFILE ];
  global.DEVICEMETHODS = [ 'init', 'getDeviceFilename', 'getConfig', 'setDevice', 'getDevice', 'startListenDevice' ];

}
