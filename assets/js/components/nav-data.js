// Single source of truth for the site's navigation tree.
// Consumed by <site-header> to render both the desktop mega-menu and the
// mobile off-canvas accordion from the same data. All hrefs are root-relative
// so the same data works no matter how deep the current page lives.

export const NAV_ITEMS = [
  { id: "home", label: "Home", href: "/index.html" },
  {
    id: "flight-lab",
    label: "Flight Lab",
    href: "/flight-lab/index.html",
    children: [
      { label: "Overview", href: "/flight-lab/index.html" },
      { label: "Aerodynamics", href: "/flight-lab/aerodynamics.html" },
      { label: "Flight Dynamics", href: "/flight-lab/flight-dynamics.html" },
      { label: "Aircraft Systems", href: "/flight-lab/aircraft-systems.html" },
      { label: "Commercial Aircraft", href: "/flight-lab/commercial-aircraft.html" },
      { label: "Military Aircraft", href: "/flight-lab/military-aircraft.html" },
      { label: "Private Aviation", href: "/flight-lab/private-aviation.html" },
      { label: "Interactive Aircraft", href: "/flight-lab/interactive-aircraft.html" },
    ],
  },
  {
    id: "space-lab",
    label: "Space Lab",
    href: "/space-lab/index.html",
    children: [
      { label: "Overview", href: "/space-lab/index.html" },
      { label: "CubeSats", href: "/space-lab/cubesats.html" },
      { label: "Rockets", href: "/space-lab/rockets.html" },
      { label: "Satellites", href: "/space-lab/satellites.html" },
      { label: "Spacecraft", href: "/space-lab/spacecraft.html" },
      { label: "Space Stations", href: "/space-lab/space-stations.html" },
      { label: "Planetary Missions", href: "/space-lab/planetary-missions.html" },
      { label: "Interactive Spacecraft", href: "/space-lab/interactive-spacecraft.html" },
    ],
  },
  {
    id: "engineering-lab",
    label: "Engineering Lab",
    href: "/engineering-lab/index.html",
    children: [
      { label: "Overview", href: "/engineering-lab/index.html" },
      { label: "Electronics", href: "/engineering-lab/electronics.html" },
      { label: "Sensors", href: "/engineering-lab/sensors.html" },
      { label: "Power Systems", href: "/engineering-lab/power-systems.html" },
      { label: "Communications", href: "/engineering-lab/communications.html" },
      { label: "Thermal Systems", href: "/engineering-lab/thermal-systems.html" },
      { label: "AI in Aerospace", href: "/engineering-lab/ai-in-aerospace.html" },
      { label: "Simulators", href: "/engineering-lab/simulators.html" },
    ],
  },
  { id: "timeline", label: "Timeline", href: "/timeline/index.html" },
  { id: "playground", label: "Playground", href: "/playground/index.html" },
  { id: "blog", label: "Blog", href: "/blog/index.html" },
];
