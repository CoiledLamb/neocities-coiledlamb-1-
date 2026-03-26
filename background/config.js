window.OilSpill = {
  spacing: 18,
  baseDotSize: 5.2,

  interactionRadius: 20,
  tealNeighborRadius: 34,
  blueWakeRadius: 40,

  blues: ["#0d1a60", "#153878", "#28598b", "#3c83a3", "#5baaba"],
  purples: ["#27114c", "#401d69", "#62328a", "#7d479b", "#995bb1"],
  teals: ["#0f5f5a", "#16827a", "#1f9d94", "#2bb3a8", "#3ec1b6"],

  canvas: null,
  ctx: null,

  width: 0,
  height: 0,
  dpr: 1,

  dots: [],
  grid: [],
  purpleBlobs: [],
  tealCurves: [],

  gridOffsetX: 0,
  gridOffsetY: 0,
  debug: {
  enabled: true,
  logInit: true,
  logFrameStats: true,
  frameSampleRate: 30,
  stopOnInvalidParticle: false,
  showOverlay: true
},
};

OilSpill.interactionRadiusSq = OilSpill.interactionRadius * OilSpill.interactionRadius;
OilSpill.tealNeighborRadiusSq = OilSpill.tealNeighborRadius * OilSpill.tealNeighborRadius;
OilSpill.blueWakeRadiusSq = OilSpill.blueWakeRadius * OilSpill.blueWakeRadius;