// Logic from https://github.com/mathieu-mp/intex-spa/tree/main
import { assertObjectMatch } from "https://deno.land/std@0.200.0/assert/mod.ts";
import { checksum_as_str } from "./checksum.ts";


export const commands = {
    status: {
        data: "8888060FEE0F01",
        type: 1
    },
    power: {
        data: "8888060F014000",
        type: 1
    },
    filter: {
        data: "8888060F010004",
        type: 1
    },
    heater: {
        data: "8888060F010010",
        type: 1
    },
    jets: {
        data: "8888060F011000",
        type: 1
    },
    bubbles: {
        data: "8888060F010400",
        type: 1
    },
    sanitizer: {
        data: "8888060F010001",
        type: 1
    },
    presetTemp: (temp: number) => ({
        data: "8888050F0C" + temp.toString(16).toUpperCase(),
        type: 1
    }),
    "info": {
        data: "",
        type: 3
    },
}

function power(data: bigint) {
    return Boolean((data >> 104n) & 0b1n)
}
function filter(data: bigint) {
    return Boolean((data >> 105n) & 0b1n)
}
function heater(data: bigint) {
    return Boolean((data >> 106n) & 0b1n)
}
function jets(data: bigint) {
    return Boolean((data >> 107n) & 0b1n)
}
function bubbles(data: bigint) {
    return Boolean((data >> 108n) & 0b1n)
}
function sanitizer(data: bigint) {
    return Boolean((data >> 109n) & 0b1n)
}

/** Current temperature of the water, expressed in `unit` */
function current_temp(data: bigint) {
    const raw_current_temp = (data >> 88n) & 0xFFn

    // If current_temp encodes a temperature, return the temperature
    if (raw_current_temp < 181) {
        return Number(raw_current_temp)
    }
    // Else if current_temp encodes an error (E81, ...), return False
    else
        return undefined
}

/** Current error code of the spa */
function error_code(data: bigint) {
    const raw_current_temp = (data >> 88n) & 0xFFn

    // If current_temp encodes an error (E81, ...), return the error code
    if (raw_current_temp >= 181) {
        const error_no = raw_current_temp - 100n
        return `E${error_no}`
    }
    // Else if current_temp encodes a temperature, return False
    else
        return undefined
}

function preset_temp(data: bigint) {
    return Number((data >> 24n) & 0xFFn)
}


export function decodeData(rawData: string) {
    // const checksum_calculated = checksum_as_str(rawData.slice(0, -2))
    // const checksum_in_response = rawData.slice(-2)
    // assert(checksum_calculated == checksum_in_response, `checksum missmatch ${checksum_calculated} != ${checksum_in_response}, ${rawData}`)

    const data = BigInt(`0x${rawData}`)

    return {
        power: power(data),
        filter: filter(data),
        heater: heater(data),
        jets: jets(data),
        bubbles: bubbles(data),
        sanitizer: sanitizer(data),
        currentTemp: current_temp(data),
        presetTemp: preset_temp(data),
        errorCode: error_code(data),
    };
}

export function prepareCommand(payload: { type: number, data: string, sid?: string }): string {
    if (!payload.sid) payload.sid = Date.now().toString();
    payload.data = payload.data + checksum_as_str(payload.data)

    return JSON.stringify(payload)
}

assertObjectMatch(decodeData('FFFF110F010700220000000080808022000012'), {
    power: true,
    filter: true,
    heater: true,
    jets: false,
    bubbles: false,
    sanitizer: false,
    currentTemp: 34,
    presetTemp: 34,
    errorCode: undefined,
});
assertObjectMatch(decodeData('FFFF110F01070025000000008080802500000C'), {
    bubbles: false,
    jets: false,
    sanitizer: false,
    filter: true,
    heater: true,
    currentTemp: 37,
    presetTemp: 37,
});

assertObjectMatch(decodeData('23002400000000808E80250000E2'), {
    bubbles: false,
    jets: false,
    sanitizer: true,
    filter: true,
    currentTemp: 36,
    presetTemp: 37,
});

// const cmd = prepareCommand({ ...commands.status, sid: "12345678901234" })
// console.log("expected", cmd)


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
