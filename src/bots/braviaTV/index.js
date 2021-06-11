const Bravia = require('bravia');

const bravia = new Bravia('192.168.10.223', '80', '5211');

bravia.system
  .getMethodTypes()
  .then((methods) => console.log(...methods.map((m) => m.methods)))
  .catch((error) => console.error(error));

// Retrieves all the available IRCC commands from the TV.
// bravia.system
//   .invoke('getRemoteControllerInfo')
//   .then((commands) => console.log(commands))
//   .catch((error) => console.error(error));

// Queries the volume info.

// number
async function getVolume() {
  const info = await bravia.audio.invoke('getVolumeInformation');
  return info.find((obj) => obj.target === 'speaker')?.volume;
}
// active|
async function getPowerStatus() {
  const info = await bravia.system.invoke('getPowerStatus');
  return info.status;
}

async function setVolume(volume) {
  return bravia.audio.invoke('setAudioVolume', '1.0', {
    target: 'speaker',
    volume: String(volume),
  });
}

// bool
async function setPowerStatus(bool) {
  return bravia.system.invoke('setPowerStatus', '1.0', { status: bool });
}

async function main() {
  //   console.log(await getVolume());
  //   console.log(await getPowerStatus());
  console.log(await bravia.system.invoke('getPowerSavingMode'));
}
// setPowerStatus(false);
main();
