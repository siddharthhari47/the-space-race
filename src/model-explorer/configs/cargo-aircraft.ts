import type { HotspotConfig, ModelExplorerConfig } from "../types";

// Positions taken from a world-space bounding-box dump of all 21 mesh
// primitives (the same offline pass used for the Su-35), not estimated by
// eye. Axes, established from the geometry rather than assumed: +Z is the
// nose, -Z is the tail (both stabilizers sit between Z -830 and -1015),
// +Y is up, X is lateral with 0 on the centreline. Scene bounds are
// 3674 x 909 x 2198 units.
//
// Unlike the Su-35, this model is NOT at real-world scale, and it isn't a
// specific named aircraft either. Its span-to-length ratio is about 1.67,
// where a real four-engine turboprop freighter sits closer to 1.2-1.4, so
// it reads as a stylised cargo aircraft rather than a replica of any type
// in service. Everything below therefore describes how this class of
// aircraft works in general. No real-world dimensions or performance
// figures are quoted against it, because there's no type to quote them
// from.
//
// What the geometry does show clearly, and what the hotspots are built
// from:
//
//   four propeller discs   436 units across, 153 thick, at X +/-461 and
//                          +/-917, all at Z 385
//   four nacelles          behind each disc at Z 174
//   one full-span wing     3600 units across at Y -64, which is above the
//                          fuselage centre at Y -189, so it's a high wing
//   one full-length body   421 x 399 x 2198, the entire fuselage as a
//                          single mesh
//   vertical stabiliser    578 tall, only 61 thick in X, at Z -562
//   horizontal stabiliser  1142 across, 29 thick, at Z -946
//   gear structures        a sponson at Y -249 plus two axle cylinders
//
// Only the flight deck and rear ramp are marked "estimated": neither has
// its own mesh, so they're positioned from where they must be on an
// aircraft laid out like this one.
const hotspots: HotspotConfig[] = [
  {
    id: "cargo-hold",
    bind: "position",
    label: "Cargo Hold",
    shortDescription: "The reason the rest of the aircraft is shaped the way it is.",
    position: [0, -189, 84],
    radius: 700,
    cameraPosition: [2400, 900, 1900],
    cameraTarget: [0, -189, 84],
    tourOrder: 1,
    confidence: "geometric",
    content: {
      purpose:
        "On an airliner you start with passengers and build a tube around them. On a freighter you start with the box you need to fit and build an aircraft around that. The hold is the design driver here, and almost every other choice on this airframe exists to serve it.",
      howItWorks:
        "The fuselage on this model is one continuous mesh running the entire 2198-unit length of the aircraft, and its cross-section stays close to square rather than tapering like a passenger cabin. That's deliberate on real freighters too. Cargo comes in rectangular pallets and containers, and a circular cross-section wastes the corners. A flat floor at a constant height also means a forklift can drive straight in and keep driving.",
      facts: [
        "Freighter floors are built far stronger than passenger floors. A cabin floor carries people and seats spread evenly; a cargo floor carries concentrated point loads from pallets and vehicles, and has to take them anywhere along its length.",
        "Loading is a balance problem as much as a volume problem. Put heavy freight too far forward or aft and the aircraft's centre of gravity moves outside limits, which is why load planning is a real job and not a formality.",
      ],
      role: "Every other part of this aircraft is in service of getting this box, and whatever is inside it, somewhere useful.",
      relatedAircraft: "Compare with the Boeing 777-300ER in the Interactive Aircraft Explorer, where the same fuselage volume is optimised for people instead.",
    },
  },
  {
    id: "high-wing",
    bind: "position",
    label: "High Wing",
    shortDescription: "Mounted on top of the fuselage, not through the middle of it.",
    position: [0, -64, 157],
    radius: 900,
    cameraPosition: [2100, 1500, 1700],
    cameraTarget: [0, -64, 157],
    tourOrder: 2,
    confidence: "geometric",
    content: {
      purpose:
        "This is the single clearest difference from an airliner, and it's measurable on the model: the wing sits at Y -64 while the fuselage centre is at Y -189, so the wing rides above the body rather than passing through it. Airliners almost always do the opposite.",
      howItWorks:
        "A low wing needs a carry-through structure crossing the fuselage, and on an airliner that's fine because it lives under the cabin floor. On a freighter that same structure would run straight through the cargo hold, cutting the usable box in half. Moving the wing on top keeps the hold clear from nose to tail. It also sits the fuselage lower to the ground, which shortens the ramp angle when you're driving something up into it.",
      facts: [
        "A high wing is naturally more stable in roll. The fuselage hangs below the lift, so the aircraft tends to right itself, which is useful when it's being flown slowly and heavily loaded.",
        "The trade is maintenance access. Engines mounted on a high wing sit well off the ground, so servicing them needs stands rather than someone simply walking up to the nacelle.",
      ],
      role: "The choice that makes a usable full-length cargo hold possible at all.",
    },
  },
  {
    id: "propellers",
    bind: "position",
    label: "Propellers",
    shortDescription: "Four of them, and the model gives each one its own disc of geometry.",
    position: [461, -119, 385],
    radius: 400,
    cameraPosition: [1500, 500, 1600],
    cameraTarget: [461, -119, 385],
    tourOrder: 3,
    confidence: "geometric",
    content: {
      purpose:
        "Propellers move a large mass of air relatively slowly. A jet moves a smaller mass very fast. For a heavy aircraft that needs to get airborne from a short, rough strip, moving lots of air slowly is exactly the right trade.",
      howItWorks:
        "Each blade is a rotating wing, and like a helicopter's rotor blade it's twisted along its length because the tip travels much further per revolution than the root. Most transport propellers are constant-speed: the blades change pitch automatically to hold a set RPM as conditions change, so the engine stays in its efficient band instead of racing and bogging down.",
      facts: [
        "The propellers on this model are 436 units across against a 3674-unit wingspan, so each disc spans roughly an eighth of the wing. That proportion is typical, and it's why ground crews treat the arc around a turboprop as a genuinely dangerous place to stand.",
        "Reversible-pitch propellers can push air forward instead of back. That gives real braking on landing, which matters a lot when the runway is short and the aircraft is heavy.",
      ],
      role: "The thrust source, and the reason this aircraft can use runways a jet freighter simply couldn't.",
    },
  },
  {
    id: "engines",
    bind: "position",
    label: "Turboprop Engines",
    shortDescription: "The nacelles behind the propellers, each holding a gas turbine geared down to drive one.",
    position: [917, -140, 190],
    radius: 400,
    cameraPosition: [2100, 600, 1400],
    cameraTarget: [917, -140, 190],
    tourOrder: 4,
    confidence: "geometric",
    content: {
      purpose:
        "A turboprop is a jet engine that has been talked out of producing thrust directly. Instead of throwing its exhaust backwards for propulsion, almost all of its power goes into turning a shaft, and that shaft turns the propeller.",
      howItWorks:
        "Air is compressed, mixed with fuel, burned, and expanded through turbines exactly as in any gas turbine. The difference is what the turbines are connected to. Here they drive a shaft through a reduction gearbox, because the turbine spins far too fast for a propeller to survive. That gearbox is doing enormous continuous work, and on any turboprop it is one of the most closely inspected components on the aircraft.",
      facts: [
        "The same core idea, geared down to drive something other than a propeller, is a turboshaft engine, which is what powers a helicopter's rotor. Flight Lab's helicopter pages cover that version.",
        "Turboprops are markedly more efficient than jets below roughly 700 km/h, which is precisely the speed band a tactical freighter operates in. Above that the propeller tips approach the speed of sound and efficiency falls apart.",
      ],
      role: "Converts fuel into shaft power, and hands the actual business of making thrust to the propeller in front of it.",
      relatedAircraft: "Contrast with the high-bypass turbofans on the 777, tuned for efficient cruise at nearly twice this speed.",
    },
  },
  {
    id: "vertical-stabilizer",
    bind: "position",
    label: "Vertical Stabilizer",
    shortDescription: "A notably tall fin, and it's tall for a specific reason.",
    position: [0, 300, -700],
    radius: 550,
    cameraPosition: [1700, 1100, -2000],
    cameraTarget: [0, 300, -700],
    tourOrder: 5,
    confidence: "geometric",
    content: {
      purpose:
        "Keeps the aircraft pointed in the direction it's actually travelling, and gives the pilot yaw control through the rudder hinged to its trailing edge.",
      howItWorks:
        "On this model the fin is 578 units tall and only 61 thick, which is a lot of surface area a long way from the centre of gravity. Four engines is the reason. If one fails, the remaining three produce strongly asymmetric thrust that tries to swing the nose toward the dead engine, and the fin and rudder have to be able to hold against that at low speed. Sizing the tail for engine-out control, rather than for normal flight, is standard practice on multi-engine aircraft.",
      facts: [
        "An engine failure on a four-engine aircraft is less severe than on a twin, because you lose a quarter of your thrust rather than half, and the failed engine is not as far off the centreline.",
        "The rudder is normally worked with the feet rather than the control column, and on most flights it does very little. It earns its size on the days something goes wrong.",
      ],
      role: "Directional stability in normal flight, and directional control on the day an engine quits.",
    },
  },
  {
    id: "horizontal-stabilizer",
    bind: "position",
    label: "Horizontal Stabilizer",
    shortDescription: "The wide, flat surface right at the back, controlling pitch.",
    position: [0, -22, -946],
    radius: 620,
    cameraPosition: [1600, 700, -2300],
    cameraTarget: [0, -22, -946],
    tourOrder: 6,
    confidence: "geometric",
    content: {
      purpose:
        "Balances the aircraft in pitch and carries the elevator, which is how the pilot commands the nose up or down.",
      howItWorks:
        "It usually produces a small downward force rather than lift, which counteracts the nose-down pitching tendency the main wing creates. On a freighter that balancing act is harder than on an airliner, because the load in the hold changes dramatically between flights and shifts the centre of gravity with it. The tail has to have enough authority to trim the aircraft across that whole range.",
      facts: [
        "This surface spans 1142 units, roughly a third of the main wing's span, which is a fairly generous tailplane. Large control authority matters more here than minimum drag.",
        "Because the loaded centre of gravity moves so much, freighter crews compute trim settings for each specific load rather than relying on a standard number.",
      ],
      role: "The surface that keeps a variably-loaded aircraft balanced, which is a harder job here than on an aircraft carrying the same thing every time.",
    },
  },
  {
    id: "landing-gear",
    bind: "position",
    label: "Landing Gear",
    shortDescription: "Tucked into fuselage-side fairings rather than into the wing.",
    position: [0, -280, -150],
    radius: 500,
    cameraPosition: [1500, 200, 1100],
    cameraTarget: [0, -280, -150],
    tourOrder: 7,
    confidence: "geometric",
    content: {
      purpose:
        "Carries the aircraft on the ground, absorbs the landing, and on a design like this has to do it on surfaces that aren't necessarily paved.",
      howItWorks:
        "With the wing mounted on top of the fuselage there's nowhere in it to stow the gear, so it retracts into fairings along the fuselage sides instead. The model shows this as a sponson structure below the fuselage centreline plus two axle cylinders. Keeping the legs short and close to the body also keeps the floor low, which is the whole point of the layout.",
      facts: [
        "Short, stout gear tolerates rough-field operation far better than the long legs a low-wing aircraft needs to give its underwing engines ground clearance.",
        "Several tactical freighters can kneel, lowering the rear of the aircraft to flatten the ramp angle further for loading.",
      ],
      role: "The part that makes 'land somewhere without a proper runway' a realistic requirement rather than an aspiration.",
    },
  },
  {
    id: "flight-deck",
    bind: "position",
    label: "Flight Deck",
    shortDescription: "Up at the nose, sitting high above the cargo floor.",
    position: [0, -60, 950],
    radius: 380,
    cameraPosition: [1200, 400, 2100],
    cameraTarget: [0, -60, 950],
    tourOrder: 8,
    confidence: "estimated",
    content: {
      purpose:
        "Where the crew fly from. On a freighter it's deliberately kept out of the way of the cargo deck, so that loading and flying don't compete for the same space.",
      howItWorks:
        "The flight deck sits forward and high, above the level of the cargo floor, which leaves the hold uninterrupted behind it. Crews on this type of aircraft are often larger than an airliner's two pilots, since someone has to manage loading, air-drops, or the loadmaster's job of keeping the aircraft in balance as things move around inside it.",
      facts: [
        "This marker is placed from where the flight deck must be on an aircraft laid out like this one. The model doesn't give the cockpit its own separate mesh, so it can't be pinned to specific geometry the way the wing or the propellers can.",
        "Low-level tactical flying puts very different demands on visibility than cruising at 35,000 feet, which is why these cockpits tend to have far more window area low down than an airliner does.",
      ],
      role: "The one part of the aircraft designed around people rather than around freight.",
    },
  },
  {
    id: "rear-ramp",
    bind: "position",
    label: "Rear Ramp",
    shortDescription: "The upswept tail, and why freighters almost always have one.",
    position: [0, -260, -720],
    radius: 480,
    cameraPosition: [1400, 300, -2100],
    cameraTarget: [0, -260, -720],
    tourOrder: 9,
    confidence: "estimated",
    content: {
      purpose:
        "Loading through the back, at floor height, straight off a truck. It's the feature that makes a cargo aircraft genuinely useful rather than just a passenger aircraft with the seats taken out.",
      howItWorks:
        "The rear fuselage sweeps upward so that a ramp can hinge down to ground level without the tail striking the ground on rotation. That upsweep costs drag and it costs structural efficiency, and it gets accepted anyway, because the alternative is craning every load in through a side door. The same opening also allows air-drops, where the ramp opens in flight and the load is extracted while the aircraft is still moving.",
      facts: [
        "This marker sits on the rear underside where the ramp structure would be. Like the flight deck, it doesn't have its own mesh on this model, so treat the position as indicative rather than exact.",
        "The upswept tail is the giveaway. If you see it on an aircraft, it almost certainly loads from the back, and it was almost certainly designed to carry things rather than people.",
      ],
      role: "The design decision that shows most clearly from the outside, and explains the whole silhouette.",
    },
  },
];

export const cargoAircraft: ModelExplorerConfig = {
  modelUrl: "/models/cargo-aircraft.glb",
  title: "Cargo Aircraft",
  credit: {
    text: '"cargo aircraft" by RizalHardi is licensed under Creative Commons Attribution 4.0 (CC BY 4.0).',
    modelUrl: "https://skfb.ly/6SqCp",
    modelUrlLabel: "cargo aircraft",
    author: "RizalHardi",
    licenseLabel: "CC BY 4.0",
    licenseUrl: "http://creativecommons.org/licenses/by/4.0/",
  },
  // Three-quarters-on from the front left, far enough out to hold all
  // 3674 units of span in frame.
  cameraDefault: {
    position: [3000, 1600, 3200],
    target: [0, -100, 84],
  },
  controlsLimits: {
    minDistance: 800,
    maxDistance: 12000,
  },
  guidedTourDwellMs: 8000,
  // This model is roughly 4400 units across its diagonal, far past the
  // 500-unit-scale fog/clip defaults that suit the Boeing. Left unset, the
  // aircraft renders as a solid block of fog colour or gets clipped out of
  // the frustum entirely — the same failure the Merlin config hit.
  fogDistance: { near: 4000, far: 16000 },
  cameraFar: 20000,
  // Sits between controlsLimits.maxDistance (12000) and cameraFar (20000),
  // so the camera is always inside the sky sphere and the sphere is always
  // inside the far plane.
  skyRadius: 15000,
  // These materials carry real metalness (0.18 to 0.77) with low roughness
  // on several, so they pick up the shared lighting rig more strongly than
  // the Boeing's flat matte surfaces do. Mild reduction rather than the
  // Merlin's 0.6, since there are no metallicRoughness textures here to
  // amplify it further.
  lightingIntensityScale: 0.8,
  hotspots,
};

export default cargoAircraft;
