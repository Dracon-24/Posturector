import AsyncStorage from '@react-native-async-storage/async-storage';

import { createCalibrationStorage } from './calibrationStorageModel';

export const calibrationStorage = createCalibrationStorage(AsyncStorage);
