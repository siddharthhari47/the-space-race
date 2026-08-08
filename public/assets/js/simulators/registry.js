// Every simulator the site plans to have, keyed by id. <simulation-container>
// looks itself up here and lazy-imports `module` only when status is "live".
// Adding a simulator later = one new module file + one entry here + a
// <simulation-container type="..."> tag wherever it should appear.
//
// `page`, when present, is a dedicated URL for this simulator — used by the
// Playground catalogue to link straight to it. Most entries also have a
// `module` and are embeddable anywhere via <simulation-container>; a few
// (like aircraft-explorer) are full standalone pages with no mount()
// module of their own, so they carry only `page`.
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
    page: "/playground/cubesat-builder.html",
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
    page: "/playground/power-budget-simulator.html",
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
    page: "/playground/orbit-simulator.html",
    status: "live",
    category: "space",
  },
  "aircraft-explorer": {
    title: "Interactive Aircraft Explorer",
    description: "A real 3D model you can rotate and zoom freely — drag to explore a commercial airliner from any angle.",
    page: "/flight-lab/interactive-aircraft.html",
    status: "live",
    category: "flight",
  },
  "helicopter-explorer": {
    title: "Interactive Helicopter Explorer",
    description: "A real 3D helicopter model you can rotate and zoom freely — click through the rotor, swashplate, tail rotor, and more.",
    page: "/flight-lab/interactive-helicopter.html",
    status: "live",
    category: "flight",
  },
  "fighter-explorer": {
    title: "Interactive Fighter Aircraft Explorer",
    description: "A real 3D Su-35 you can rotate and zoom freely — click through the intakes, engines, thrust-vectoring nozzles, and control surfaces.",
    page: "/flight-lab/interactive-fighter-aircraft.html",
    status: "live",
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
