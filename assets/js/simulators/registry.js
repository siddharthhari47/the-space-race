// Every simulator the site plans to have, keyed by id. <simulation-container>
// looks itself up here and lazy-imports `module` only when status is "live".
// Adding a simulator later = one new module file + one entry here + a
// <simulation-container type="..."> tag wherever it should appear.
export const SIMULATOR_REGISTRY = {
  "cubesat-exploded-view": {
    title: "CubeSat Exploded View",
    description: "Pull a 1U CubeSat apart layer by layer and see what's inside.",
    module: "/assets/js/simulators/cubesat-exploded-view.js",
    status: "coming-soon",
    category: "space",
  },
  "cubesat-builder": {
    title: "Build a CubeSat",
    description: "Choose a mission, pick components, and see what fits inside the unit budget.",
    module: "/assets/js/simulators/cubesat-builder.js",
    status: "live",
    category: "space",
  },
  "cubesat-mission-planner": {
    title: "CubeSat Mission Planner",
    description: "Plan an orbit, a payload, and a ground station schedule for a small mission.",
    module: "/assets/js/simulators/cubesat-mission-planner.js",
    status: "coming-soon",
    category: "space",
  },
  "power-budget-simulator": {
    title: "Power Budget Simulator",
    description: "Balance solar panel area, battery capacity, and payload draw over an orbit.",
    module: "/assets/js/simulators/power-budget-simulator.js",
    status: "live",
    category: "engineering",
  },
  "communications-simulator": {
    title: "Communications Simulator",
    description: "See how link budget, ground stations, and data rate trade off against each other.",
    module: "/assets/js/simulators/communications-simulator.js",
    status: "coming-soon",
    category: "engineering",
  },
  "orbit-simulator": {
    title: "Satellite Orbit Simulator",
    description: "Adjust altitude and inclination and watch how the orbit and ground track change.",
    module: "/assets/js/simulators/orbit-simulator.js",
    status: "live",
    category: "space",
  },
  "aircraft-explorer": {
    title: "Interactive Aircraft Explorer",
    description: "Click through a commercial, military, private, or cargo aircraft to learn every part.",
    module: "/assets/js/simulators/aircraft-explorer.js",
    status: "coming-soon",
    category: "flight",
  },
  "flight-dynamics-simulator": {
    title: "Flight Dynamics",
    description: "Explore pitch, roll, and yaw and how control surfaces move an aircraft through the air.",
    module: "/assets/js/simulators/flight-dynamics-simulator.js",
    status: "coming-soon",
    category: "flight",
  },
  "rocket-builder": {
    title: "Build Your Rocket",
    description: "Stack stages, engines, and payload and see if your rocket can reach orbit.",
    module: "/assets/js/simulators/rocket-builder.js",
    status: "coming-soon",
    category: "space",
  },
  "interactive-rocket": {
    title: "Interactive Rocket",
    description: "Explore a launch vehicle stage by stage, from engines to payload fairing.",
    module: "/assets/js/simulators/interactive-rocket.js",
    status: "coming-soon",
    category: "space",
  },
  "docking-simulator": {
    title: "Docking Simulator",
    description: "Line up, close in, and dock two spacecraft together.",
    module: "/assets/js/simulators/docking-simulator.js",
    status: "coming-soon",
    category: "space",
  },
};
