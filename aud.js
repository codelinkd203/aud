const AUD_MAGIC = "audFILE";
const AUD_MAGIC_BYTES = new TextEncoder().encode(AUD_MAGIC);

function isAUDFile(bytes) {
    const header = new TextDecoder().decode(bytes.slice(0, AUD_MAGIC.length));
    return header === AUD_MAGIC;
}

async function createAUD({
    audioFile,
    coverFile = null,
    lyricsFile = null,
    metadata = {}
}) {
    if (!audioFile) {
        throw new Error("An audio file is required.");
    }

    const zip = new JSZip();

    // The actual audio bytes.
    zip.file("audiobytes", await audioFile.arrayBuffer());

    // Metadata.
    const data = {
        format: "AUD",
        version: 1,

        title: metadata.title || "",
        artist: metadata.artist || "",
        album: metadata.album || "",
        albumArtist: metadata.albumArtist || "",

        composer: metadata.composer || "",
        genre: metadata.genre || "",
        year: metadata.year || "",

        track: metadata.track || "",
        disc: metadata.disc || "",

        publisher: metadata.publisher || "",
        copyright: metadata.copyright || "",
        isrc: metadata.isrc || "",

        comment: metadata.comment || "",
        explicit: Boolean(metadata.explicit),

        audioType: audioFile.type || "audio/mpeg",
        originalFilename: audioFile.name,

        createdAt: new Date().toISOString()
    };

    zip.file("data.json", JSON.stringify(data, null, 2));

    // Optional artwork.
    if (coverFile) {
        zip.file(coverFile.name, await coverFile.arrayBuffer());
    }

    // Optional lyrics.
    if (lyricsFile) {
        zip.file("lyrics.lrc", await lyricsFile.text());
    }

    const zipBytes = await zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: {
            level: 6
        }
    });

    return new Blob(
        [AUD_MAGIC_BYTES, zipBytes],
        { type: "audio/aud" }
        );
}

async function openAUD(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());

    if (!isAUDFile(bytes)) {
        throw new Error("This is not a valid .aud file.");
    }

    const zipBytes = bytes.slice(AUD_MAGIC.length);
    const zip = await JSZip.loadAsync(zipBytes);

    const result = {
        audioBlob: null,
        audioType: "audio/mpeg",
        lyrics: null,
        artworkBlob: null,
        metadata: {},
        files: []
    };

    for (const filename of Object.keys(zip.files)) {
        const entry = zip.files[filename];

        if (entry.dir) continue;

        result.files.push(filename);

        const lower = filename.toLowerCase();

        if (lower === "audiobytes") {
            const audioBytes = await entry.async("uint8array");

            result.audioBlob = new Blob(
                [audioBytes],
                { type: result.audioType }
                );
        }

        else if (lower === "data.json" || lower === "metadata.json") {
            try {
                result.metadata = JSON.parse(
                    await entry.async("text")
                    );

                if (result.metadata.audioType) {
                    result.audioType = result.metadata.audioType;
                }
            } catch (error) {
                console.warn("Could not parse metadata:", error);
            }
        }

        else if (lower.endsWith(".lrc")) {
            result.lyrics = await entry.async("text");
        }

        else if (
            lower.endsWith(".jpg") ||
            lower.endsWith(".jpeg") ||
            lower.endsWith(".png") ||
            lower.endsWith(".webp") ||
            lower.endsWith(".gif")
            ) {
            const imageBytes = await entry.async("uint8array");

        result.artworkBlob = new Blob([imageBytes]);
    }
}

    // audiobytes may have been read before data.json.
    // Rebuild the Blob with the correct MIME type.
if (result.audioBlob) {
    const audioBytes = await result.audioBlob.arrayBuffer();

    result.audioBlob = new Blob(
        [audioBytes],
        { type: result.audioType }
        );
}

return result;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
}

function parseLRC(lrc) {
    if (!lrc) return [];

    return lrc
    .split("\n")
    .map(line => {
        const match = line.match(
            /\[(\d+):(\d+(?:\.\d+)?)\](.*)/
            );

        if (!match) return null;

        const minutes = Number(match[1]);
        const seconds = Number(match[2]);

        return {
            time: minutes * 60 + seconds,
            text: match[3].trim()
        };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
}
