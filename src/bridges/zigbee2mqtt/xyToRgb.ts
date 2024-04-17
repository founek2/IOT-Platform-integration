import xyy from "npm:color-space/xyy.js"
import xyz from "npm:color-space/xyz.js"

const result = xyz.rgb(xyy.xyz([0.2266, 0.5593, 100]))
console.log("here", result)




export function colorXy2Rgb(x: number, y: number) {

    // logTrace "< Color xy: ($x, $y)"

    const Y = 1 //;
    const X = (Y / y) * x//;
    const Z = (Y / y) * (1.0 - x - y)//;

    // logTrace "< Color XYZ: ($X, $Y, $Z)"

    // sRGB, Reference White D65
    const M = [
        [3.2410032, -1.5373990, -0.4986159],
        [-0.9692243, 1.8759300, 0.0415542],
        [0.0556394, -0.2040112, 1.0571490]
    ]

    let r = X * M[0][0] + Y * M[0][1] + Z * M[0][2]
    let g = X * M[1][0] + Y * M[1][1] + Z * M[1][2]
    let b = X * M[2][0] + Y * M[2][1] + Z * M[2][2]

    const max = Math.max(r, g, b)
    r = colorGammaRevert(r / max)
    g = colorGammaRevert(g / max)
    b = colorGammaRevert(b / max)

    // logTrace "< Color RGB: ($r, $g, $b)"

    return { red: r, green: g, blue: b }
}


function colorGammaRevert(component: number) {
    return (component <= 0.0031308) ? (12.92 * component) : ((1.0 + 0.055) * Math.pow(component, (1.0 / 2.4)) - 0.055);
}
