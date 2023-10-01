import { assertObjectMatch } from "https://deno.land/std@0.200.0/assert/mod.ts";

export enum PumpState {
    panelOff = 'panelOff',
    pumpOff = 'pumpOff',
    pumpOn = 'pumpOn',
    pumpAndHeater = 'pumpAndHeater',
    nozzles = 'nozzles',
}

export const pumpStateToEnum = {
    '0': PumpState.panelOff,
    '1': PumpState.pumpOff,
    '3': PumpState.pumpOn,
    '7': PumpState.pumpAndHeater,
    '9': PumpState.nozzles,
};

export function decodeData(data: string) {
    const withoutPrefix = data.replace('FFFF110F01', '');
    const bubbles = withoutPrefix.substring(0, 1) as '0' | '1' | '2';
    const pump = withoutPrefix.substring(1, 2) as '0' | '1' | '3' | '7' | '9';

    const currentTemp = withoutPrefix.substring(4, 6);
    const presetTemp = withoutPrefix.substring(6 + '00000000808080'.length, 6 + '00000000808080'.length + 2);
    const pumpState = pumpStateToEnum[pump];

    return {
        bubbles: bubbles == '1',
        pumpState: pumpState,
        pump: pumpState == PumpState.pumpOn || pumpState == PumpState.pumpAndHeater,
        nozzles: pumpState == PumpState.nozzles,
        electrolysis: bubbles == '2',
        currentTemp: parseInt(currentTemp, 16),
        presetTemp: parseInt(presetTemp, 16),
    };
}

assertObjectMatch(decodeData('FFFF110F01070025000000008080802500000C'), {
    bubbles: false,
    nozzles: false,
    electrolysis: false,
    pump: true,
    pumpState: PumpState.pumpAndHeater,
    currentTemp: 37,
    presetTemp: 37,
});

assertObjectMatch(decodeData('23002400000000808E80250000E2'), {
    bubbles: false,
    nozzles: false,
    electrolysis: true,
    pump: true,
    pumpState: PumpState.pumpOn,
    currentTemp: 36,
    presetTemp: 37,
});

assertObjectMatch(decodeData('070023000000008080802500000E'), {
    bubbles: false,
    nozzles: false,
    electrolysis: false,
    pump: true,
    pumpState: PumpState.pumpAndHeater,
    currentTemp: 35,
    presetTemp: 37,
});

assertObjectMatch(decodeData('090023000000008080802500000C'), {
    bubbles: false,
    nozzles: true,
    electrolysis: false,
    pump: false,
    pumpState: PumpState.nozzles,
    currentTemp: 35,
    presetTemp: 37,
});

/*
FFFF110F01
0 - 0 bubbles off, 1 bubbles on, 2 cleaning on
7 - panel/pump - 0 - panel off, 1 pump off, 3  pump on, 7 pump on + heat, 9 nozzles
00
25 - current temp
00000000808080
25 - preset temp
00000C
*/

// zapnuta pumpa + cisteni -
// FFFF110F01 23002400000000808E80250000E2
// FFFF110F01 230024000000008A8880250000DE - nastaveno znovu

// vše vypnuto
// FFFF110F01 01002400000000808E8025000005

// pump + heat
// FFFF110F01 070023000000008080802500000E

// just pump
// FFFF110F01 0300230000000082808025000010

// just bubbles
// FFFF110F01 1100230000000080808025000004

// just nozzles
// FFFF110F01 090023000000008080802500000C
