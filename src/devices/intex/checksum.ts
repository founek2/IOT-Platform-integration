// Logic from https://github.com/mathieu-mp/intex-spa/tree/main

import { assert } from "@std/assert";

function mod(number: bigint, mod: bigint) {
    return ((number % mod) + mod) % mod;
}

/** Return integer checksum for the given data, as expected by Intex Spa protocol */
export function checksum_as_int(data: string): bigint {
    let calculated_checksum = 0xFFn

    for (let i = 0; i < data.length; i += 2) {
        calculated_checksum = calculated_checksum - (
            BigInt("0x" + data.slice(i, i + 2))
        )
        // console.log(i, data.slice(i, i + 2), calculated_checksum)
    }

    calculated_checksum = mod(calculated_checksum, 0xFFn)
    // console.log("0", calculated_checksum)

    // Fix: https://github.com/mathieu-mp/intex-spa/issues/27
    if (calculated_checksum == 0x00n) {
        calculated_checksum = 0xFFn
    }

    return calculated_checksum
}

/** Return string checksum for the given data, as expected by Intex Spa protocol
 *  Return checksum as a hex string without 0x prefix
*/
export function checksum_as_str(data: string): string {
    return checksum_as_int(data).toString(16).toUpperCase().padStart(2, "0")
}

assert(checksum_as_str("FFFF110F0107002200000000808080220000") === "12")
assert(checksum_as_str("FFFF110F0107002500000000808080260000") === "0B")
// console.log("here", checksum_as_str("1111"))
// console.log("sum", checksum_as_int("FFFF110F0107002200000000808080220000"))