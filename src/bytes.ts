export function textToBytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
    const totalLength = arrays.reduce(
        (total, array) => total + array.byteLength,
        0,
    );

    const result = new Uint8Array(totalLength);

    let offset = 0;
    arrays.forEach((array) => {
        result.set(array, offset);
        offset += array.byteLength;
    });

    return result;
}

export function bytesToText(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
}
