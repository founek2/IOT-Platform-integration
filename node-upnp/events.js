import { parseTime } from "./time.js";


const toArray = value => value.split(',');

export default {
  CurrentMediaDuration: parseTime,
  CurrentTrackDuration: parseTime,
  CurrentTransportActions: toArray,
  PossiblePlaybackStorageMedia: toArray
}
