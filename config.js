// Bedrock Web Map configuration
// Minecraft X/Z (anchor) is mapped to the center point below.
// X+ = east, Z+ = south. One Minecraft block = one meter by default.
window.WEBMAP_CONFIG = {
  API_BASE: "",
  MAP: {
    anchorMinecraftX: 406,
    anchorMinecraftZ: 1246,
    anchorLatitude: 35.6279,
    anchorLongitude: 139.8764,
    metersPerBlock: 1,
    // Approximate rectangle around Tokyo Disney Resort; players outside it are hidden.
    bounds: [[35.6150, 139.8670], [35.6400, 139.9010]],
    // Minecraft L-shaped map control points supplied by the user (X, Z).
    // These are stored for calibration; geographic alignment still needs a real-world reference point.
    minecraftMapPoints: [
      { id: 1, x: 1560, z: 0 },
      { id: 2, x: 1560, z: 497 },
      { id: 3, x: 2079, z: 497 },
      { id: 4, x: 2079, z: 1991 },
      { id: 5, x: 1560, z: 1991 },
      { id: 6, x: 0, z: 0 }
    ],
    initialZoom: 15
  }
};
