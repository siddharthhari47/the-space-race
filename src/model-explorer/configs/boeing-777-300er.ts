import type { HotspotConfig, ModelExplorerConfig } from "../types";

// Computed directly from the glTF's own accessor data (min/max + full node
// transform chain, including the two parent nodes above "RootNode" that
// carry an axis-convention conversion + ~0.084 scale) — not measured by
// eye. Scene bounding box: [-22.82, -0.23, -21.38] to [26.08, 11.91, 21.95].
// X = fuselage length (nose at min, tail at max), Y = vertical (ground at
// min, vertical-stabilizer tip at max), Z = wingspan (centerline ≈ 0.3-0.5).
//
// This model's 430 scene nodes carry zero semantic names (raw FBX-export
// artifacts like "NurbsPath.028", "Cylinder.094") — every hotspot below
// uses `bind: "position"`. Ten hotspots (marked confidence: "geometric")
// were placed from a computed world-space mesh-cluster analysis with real
// evidence (position, size, left/right symmetry) and then spot-checked
// against live screenshots of the rendered model — nose, cockpit windows,
// fuselage window line, wing sweep, both engines, main gear, the tail
// fin/stabilizer assembly, and a raked (not blended) wingtip all matched
// expectations. The remaining eight (confidence: "estimated") have no
// distinct geometric cluster of their own — Cockpit, Winglet, Tail, Slats,
// Rudder, Elevator, APU, and Cargo Hold are placed from 777 anatomy
// relative to the confirmed clusters, spot-checked visually where
// possible, but not measured precisely. Flag these for a closer look once
// this is live and you can rotate the model yourself.
//
// +Z is treated as the model's right side, -Z as its left, throughout —
// an assumption made without being able to confirm handedness against a
// labeled reference; verify "Left Engine" and "Right Engine" land on the
// sides you expect once you can see it live.

const hotspots: HotspotConfig[] = [
  {
    id: "nose",
    bind: "position",
    label: "Nose",
    shortDescription: "The forward fuselage, shaped to move smoothly through the air ahead of everything else.",
    position: [-21.5, 4.2, 0.5],
    radius: 2.4,
    cameraPosition: [-8, 10, 14],
    cameraTarget: [-21.5, 4.2, 0.5],
    tourOrder: 1,
    confidence: "geometric",
    content: {
      purpose:
        "The nose houses the weather radar and, just behind it, the cockpit — its rounded shape is chosen for aerodynamics and radar performance, not styling.",
      howItWorks:
        "Under the radome (the nose cone's outer skin) sits a rotating weather radar dish that scans the sky ahead for storms. The radome itself is made from a composite material that's structurally strong but doesn't block radar signals the way metal would — everywhere else on the aircraft is metal or carbon fiber, but the nose has to let radar through, not reflect it.",
      facts: [
        "The nose radome is one of the few parts of an airliner not made from a radar-reflective material, by necessity.",
        "Pitot tubes near the nose measure airspeed by comparing moving air pressure to static pressure — a design essentially unchanged since the 19th century.",
      ],
      role:
        "Everything downstream — the cockpit's view forward, the radar's ability to route around storms, the fuselage's drag — starts with the nose's shape.",
      relatedAircraft: "Every modern airliner uses a broadly similar radar-transparent composite radome, including the A350 and 787.",
    },
  },
  {
    id: "cockpit",
    bind: "position",
    label: "Cockpit",
    shortDescription: "Where the flight crew controls the aircraft, just aft of the radome.",
    position: [-19, 5, 0.5],
    radius: 2.2,
    cameraPosition: [-13, 8, 7],
    cameraTarget: [-19, 5, 0.5],
    tourOrder: 2,
    confidence: "estimated",
    content: {
      purpose:
        "The cockpit is where the two-pilot flight crew flies the aircraft: managing flight controls, engines, navigation, and communication with air traffic control.",
      howItWorks:
        "Like the rest of Boeing's modern airliners, the 777's cockpit uses fly-by-wire controls — the pilots' inputs go through flight computers rather than a direct mechanical link to the control surfaces. Boeing's implementation keeps a control yoke (rather than Airbus's sidestick) and lets the pilot feel some resistance from the control surfaces, a deliberate design difference between the two manufacturers' philosophies.",
      facts: [
        "The 777 was one of the first Boeing airliners designed almost entirely on computer (CAD), rather than physical mockups, when it launched in 1994.",
        "Two pilots fly a 777; earlier widebody airliners like the original 747 needed a third crew member, a flight engineer, to manage systems.",
      ],
      role:
        "The cockpit is the aircraft's control center — every system on this page is, ultimately, something the crew here can monitor or command.",
      relatedAircraft: "The A320's sidestick-based fly-by-wire is the clearest contrast to Boeing's yoke-based approach used here and on the 787.",
    },
  },
  {
    id: "fuselage",
    bind: "position",
    label: "Fuselage",
    shortDescription: "The main body tube connecting nose to tail, carrying passengers, cargo, and structure.",
    position: [1.3, 3.9, 0.5],
    radius: 5.5,
    cameraPosition: [1.3, 10, 20],
    cameraTarget: [1.3, 3.9, 0.5],
    tourOrder: 3,
    confidence: "geometric",
    content: {
      purpose:
        "The fuselage is the structural backbone of the aircraft — every other major part (wings, tail, landing gear, engines) attaches to it, and it's what's pressurized to keep passengers breathing comfortably at cruise altitude.",
      howItWorks:
        "It's built as a semi-monocoque structure: an outer aluminum (or, on newer aircraft, composite) skin stiffened by internal rings (frames) and lengthwise stringers, so the skin itself carries real structural load rather than just serving as a cover. Pressurizing and depressurizing it thousands of times over an aircraft's life is a major fatigue-design consideration.",
      facts: [
        "A 777-300ER's fuselage is roughly 73 meters (242 ft) long — longer than a 747-400's, despite having only two engines.",
        "Cabin pressure at cruise altitude is held equivalent to roughly 6,000-8,000 feet, not sea level.",
      ],
      role:
        "The fuselage doesn't generate lift itself, but it has to survive the combined loads from the wings, tail, and pressurization cycle for the aircraft's entire service life.",
      relatedAircraft: "The 787's fuselage is largely carbon-fiber composite instead of aluminum, allowing a higher cabin pressure than the 777's.",
    },
  },
  {
    id: "cargo-hold",
    bind: "position",
    label: "Cargo Hold",
    shortDescription: "Lower-deck space beneath the passenger cabin, used for baggage and freight.",
    position: [-6, 2, 0.5],
    radius: 4.5,
    cameraPosition: [0, 6, 10],
    cameraTarget: [-6, 2, 0.5],
    tourOrder: 4,
    confidence: "estimated",
    content: {
      purpose:
        "Below the passenger cabin floor, the lower deck carries checked baggage, air freight, and sometimes livestock or vehicles — space that would otherwise just be structure and empty air beneath the passengers.",
      howItWorks:
        "Standardized unit load devices (ULDs — metal freight containers shaped to match the hold's curved walls) let ground crews load and unload cargo quickly, sliding them along rollers built into the floor rather than hand-loading loose items.",
      facts: [
        "A 777-300ER's belly holds are large enough to carry standard air-cargo containers, not just loose baggage.",
        "Cargo holds are pressurized and, on most flights, heated — unpressurized cargo would be a serious problem at cruise altitude.",
      ],
      role:
        "On many long-haul routes, belly cargo revenue is a meaningful part of what makes the flight profitable, not just an afterthought.",
      relatedAircraft: "Dedicated freighter variants (like the 777F) remove the passenger cabin entirely and use the whole fuselage for cargo.",
    },
  },
  {
    id: "wing",
    bind: "position",
    label: "Wing",
    shortDescription: "The primary lift-generating surface, swept back and mounted low on the fuselage.",
    position: [2.5, 3.6, 12],
    radius: 5,
    includeLargeMeshes: true,
    cameraPosition: [-2, 9, 22],
    cameraTarget: [2.5, 3.6, 12],
    tourOrder: 5,
    confidence: "geometric",
    content: {
      purpose:
        "The wing generates the lift that holds the aircraft up, and its internal structure carries the fuel, the engines, and the landing gear.",
      howItWorks:
        "Air moving over the curved, angled wing gets deflected downward, and by Newton's third law the wing gets pushed up in reaction — the same physics covered on Flight Lab's Aerodynamics page. The wing sweeps backward, which delays the onset of compressibility effects at high cruise speed, letting the aircraft fly faster before drag rises sharply.",
      facts: [
        "The 777-300ER's wingspan is about 64.8 meters (212 ft 7 in) — wider than a football field is long.",
        "Most of the wing's internal volume is fuel tank, not empty structure.",
      ],
      role:
        "Every other flight-control surface on the wing — flaps, slats, ailerons — exists to adjust how much lift this one surface produces and how it's distributed.",
      relatedAircraft: "The 787's wing flexes visibly more in flight than the 777's, a deliberate result of its composite construction.",
    },
  },
  {
    id: "slats",
    bind: "position",
    label: "Slats",
    shortDescription: "Leading-edge panels that extend forward and down to add lift at low speed.",
    position: [-1, 3.5, 10],
    radius: 2.2,
    cameraPosition: [-6, 7, 17],
    cameraTarget: [-1, 3.5, 10],
    tourOrder: 6,
    confidence: "estimated",
    content: {
      purpose:
        "Slats extend from the wing's leading edge during takeoff and landing, effectively changing the wing's shape to generate more lift at the low speeds those phases require.",
      howItWorks:
        "Extending a slat opens a narrow slot between it and the wing, which re-energizes the airflow over the top of the wing and delays the airflow separation that causes a stall — letting the wing hold a higher angle of attack before stalling than it could in its cruise configuration.",
      facts: [
        "Slats and flaps work together — a normal takeoff or landing configuration extends both simultaneously.",
        "At cruise, slats retract flush into the wing's leading edge to minimize drag; they're only useful, and only used, at low speed.",
      ],
      role:
        "Slats are why an airliner can take off and land at survivable, runway-length-compatible speeds despite a wing shaped for efficient high-speed cruise.",
      relatedAircraft: "Nearly every jet airliner, from the 737 to the A380, uses some form of leading-edge slat.",
    },
  },
  {
    id: "flaps",
    bind: "position",
    label: "Flaps",
    shortDescription: "Trailing-edge panels that extend down and back to add lift and drag for takeoff and landing.",
    position: [3.9, 3.3, 9.7],
    radius: 2.5,
    cameraPosition: [0, 7, 18],
    cameraTarget: [3.9, 3.3, 9.7],
    tourOrder: 7,
    confidence: "geometric",
    content: {
      purpose:
        "Flaps extend from the wing's trailing edge to increase both the wing's camber (curvature) and its surface area, generating more lift at low speed — at the cost of added drag, which is often welcome on landing approach.",
      howItWorks:
        "The 777 uses large single-slotted flaps that slide backward and down on tracks, rather than simply hinging downward — increasing wing area as well as camber. Different flap settings (measured in degrees) are used for takeoff versus landing, trading lift for drag depending on which the phase of flight needs more.",
      facts: [
        "Full landing flap on a widebody airliner can nearly double the wing's effective lift coefficient compared to the clean (retracted) configuration.",
        "The flap track fairings — the teardrop-shaped bumps visible under the wing in flight — house the mechanism that slides the flaps backward.",
      ],
      role:
        "Flaps are what let a wing optimized for efficient 900 km/h cruise also work at a 260 km/h landing approach speed.",
      relatedAircraft: "The 747's complex triple-slotted flaps were even more elaborate than the 777's; most modern widebodies have simplified back to single- or double-slotted designs.",
    },
  },
  {
    id: "aileron",
    bind: "position",
    label: "Ailerons",
    shortDescription: "Outboard trailing-edge surfaces that roll the aircraft left or right.",
    position: [5.1, 3.75, 13.2],
    radius: 2.3,
    cameraPosition: [0, 7, 21],
    cameraTarget: [5.1, 3.75, 13.2],
    tourOrder: 8,
    confidence: "geometric",
    content: {
      purpose:
        "Ailerons control roll — one side deflects up while the other deflects down, changing lift asymmetrically and banking the aircraft into a turn.",
      howItWorks:
        "Deflecting an aileron down increases that wing's lift; the opposite aileron deflects up, decreasing lift on that side. The lift imbalance rolls the aircraft toward the wing with less lift — the same wing-warping principle the Wright brothers pioneered in 1903, refined into a hinged surface.",
      facts: [
        "The 777 has both low-speed and high-speed ailerons; the outboard ailerons lock out at cruise speed to avoid overstressing the wingtip, leaving only the inboard ailerons active.",
        "Ailerons are almost always used together with rudder input — a coordinated turn, not aileron alone.",
      ],
      role:
        "Ailerons are one of the three primary flight controls (with elevator and rudder) covered on Flight Lab's Flight Dynamics page.",
      relatedAircraft: "Many modern widebodies, including the 787, use spoilers on the wing's upper surface to assist roll control alongside conventional ailerons.",
    },
  },
  {
    id: "winglet",
    bind: "position",
    label: "Winglet",
    shortDescription: "The wingtip — on this model, a raked design rather than a sharply upturned winglet.",
    position: [7, 4.6, 21.5],
    radius: 2,
    cameraPosition: [0, 8, 27],
    cameraTarget: [7, 4.6, 21.5],
    tourOrder: 9,
    confidence: "estimated",
    content: {
      purpose:
        "Wingtip shaping exists to reduce induced drag — the energy lost to a vortex that forms as high-pressure air beneath the wing spills around the tip into the low-pressure air above.",
      howItWorks:
        "The 777-300ER uses a raked wingtip: the outermost wing section sweeps back more sharply than the rest of the wing, rather than bending sharply upward like a blended winglet. A raked tip achieves a similar drag-reduction goal by increasing effective span and smoothing the tip vortex, without the added structural weight of a hard upward bend.",
      facts: [
        "The 777-300ER's raked wingtips add roughly 1 meter each to the wingspan compared to the original 777-300's tips.",
        "A wingtip's design is a genuine engineering trade-off, not a styling choice — it balances drag reduction against added weight and bending load at the wing root.",
      ],
      role:
        "Wingtip shaping is a direct, visible answer to induced drag, the loss covered in more depth on Flight Lab's Aerodynamics page.",
      relatedAircraft: "The 737 MAX and A320neo family use pronounced blended/split winglets instead of a raked tip — a different solution to the same drag problem.",
    },
  },
  {
    id: "engine-left",
    bind: "position",
    label: "Left Engine",
    shortDescription: "One of two underwing turbofan engines — the primary source of thrust.",
    position: [-3.25, 1.9, -6.9],
    radius: 3.2,
    cameraPosition: [-3.25, 6, -16],
    cameraTarget: [-3.25, 1.9, -6.9],
    tourOrder: 10,
    confidence: "geometric",
    content: {
      purpose:
        "The engines convert fuel into thrust, pushing the aircraft forward fast enough for the wings to generate lift.",
      howItWorks:
        "A high-bypass turbofan pulls in far more air than it actually burns — most of the incoming air is accelerated by the large front fan and pushed around the engine core rather than through it, which is quieter and more fuel-efficient than pushing all the air through combustion. The 777-300ER is powered by GE90 engines, among the largest and most powerful jet engines ever put into service.",
      facts: [
        "The GE90-115B's fan is about 3.4 meters (11 ft) in diameter — wide enough that a Boeing 737's fuselage could almost fit through it.",
        "The 777 was the first airliner ever certified for 180-minute ETOPS (twin-engine long-haul operation) at entry into service, reflecting extreme confidence in a two-engine design over long overwater routes.",
      ],
      role:
        "Engines are covered in more depth, alongside redundancy philosophy, on Flight Lab's Aircraft Systems page.",
      relatedAircraft: "The GE90 family is unique to the 777; the 787 and A350 use different engine families (GEnx/Trent 1000 and Trent XWB) sized for their own airframes.",
    },
  },
  {
    id: "engine-right",
    bind: "position",
    label: "Right Engine",
    shortDescription: "One of two underwing turbofan engines — the primary source of thrust.",
    position: [-3.25, 1.9, 6.9],
    radius: 3.2,
    cameraPosition: [-3.25, 6, 16],
    cameraTarget: [-3.25, 1.9, 6.9],
    tourOrder: 11,
    confidence: "geometric",
    content: {
      purpose:
        "The engines convert fuel into thrust, pushing the aircraft forward fast enough for the wings to generate lift.",
      howItWorks:
        "A high-bypass turbofan pulls in far more air than it actually burns — most of the incoming air is accelerated by the large front fan and pushed around the engine core rather than through it, which is quieter and more fuel-efficient than pushing all the air through combustion. The 777-300ER is powered by GE90 engines, among the largest and most powerful jet engines ever put into service.",
      facts: [
        "The GE90-115B produces over 110,000 lbs of thrust — among the highest ever certified for a commercial jet engine.",
        "Both engines are mirror images of each other in mounting, but not always in internal rotation direction, depending on the specific engine family's design.",
      ],
      role:
        "Engines are covered in more depth, alongside redundancy philosophy, on Flight Lab's Aircraft Systems page.",
      relatedAircraft: "The GE90 family is unique to the 777; the 787 and A350 use different engine families (GEnx/Trent 1000 and Trent XWB) sized for their own airframes.",
    },
  },
  {
    id: "landing-gear",
    bind: "position",
    label: "Landing Gear",
    shortDescription: "The wheeled struts that support the aircraft on the ground.",
    position: [0.3, 1.2, 0.5],
    radius: 3.8,
    cameraPosition: [6, 5, 10],
    cameraTarget: [0.3, 1.2, 0.5],
    tourOrder: 12,
    confidence: "geometric",
    content: {
      purpose:
        "Landing gear absorbs the shock of touchdown, supports the aircraft's full weight while on the ground, and lets it taxi, brake, and steer.",
      howItWorks:
        "Oleo-pneumatic struts (a piston working against compressed gas and hydraulic fluid) absorb landing impact rather than a simple spring, which would bounce the aircraft back into the air. The 777-300ER's main gear uses six-wheel bogies on each side — more wheels than most airliners — to spread its weight over more runway surface and more brake capacity.",
      facts: [
        "The 777-300ER's main landing gear is among the largest ever fitted to a commercial airliner, a direct consequence of the aircraft's weight.",
        "Landing gear typically retracts within seconds of takeoff both to reduce drag and because it isn't needed again until the next landing.",
      ],
      role:
        "Landing gear is the aircraft's only structural connection to the ground — every other system exists to keep the aircraft off it.",
      relatedAircraft: "The 747-8's main gear uses four separate bogies (16 wheels total) to handle an even higher maximum weight than the 777's.",
    },
  },
  {
    id: "tail",
    bind: "position",
    label: "Tail",
    shortDescription: "The aft fuselage and tail cone, immediately ahead of the empennage.",
    position: [24.5, 4, 0.5],
    radius: 2.8,
    cameraPosition: [31, 7, 7],
    cameraTarget: [24.5, 4, 0.5],
    tourOrder: 13,
    confidence: "estimated",
    content: {
      purpose:
        "The tail cone tapers the fuselage down to a point behind the pressurized cabin, fairing the empennage's structure into the rest of the aircraft.",
      howItWorks:
        "Unlike the forward fuselage, the tail cone sits behind the pressure bulkhead — it isn't pressurized, which is part of why the APU can live back there without needing to be part of the sealed cabin environment.",
      facts: [
        "The area just behind the rear pressure bulkhead is one of the few unpressurized interior spaces on the aircraft.",
        "Static discharge wicks — small rod-like fittings — are often mounted along the tail cone's trailing edges to bleed off static electricity built up in flight.",
      ],
      role:
        "The tail cone is the transition between the fuselage and the empennage (vertical and horizontal stabilizers) covered next.",
      relatedAircraft: "Tail cone shape varies more between airliner families than most people notice — it's driven partly by APU placement and rear pressure bulkhead geometry.",
    },
  },
  {
    id: "vertical-stabilizer",
    bind: "position",
    label: "Vertical Stabilizer",
    shortDescription: "The upright tail fin, providing directional stability and mounting the rudder.",
    position: [20.5, 7.5, 0.5],
    radius: 5,
    cameraPosition: [28, 10, 14],
    cameraTarget: [20.5, 7.5, 0.5],
    tourOrder: 14,
    confidence: "geometric",
    content: {
      purpose:
        "The vertical stabilizer keeps the aircraft pointed the direction it's traveling — without it, the aircraft would be directionally unstable and tend to yaw unpredictably.",
      howItWorks:
        "Like the wing, it's an airfoil shape, but mounted upright and (in level flight) producing zero net sideways force — it only generates force when the aircraft yaws off its direction of travel, and that force pushes the nose back in line. The rudder, hinged to its trailing edge, lets the pilot add deliberate yaw input rather than only correcting unwanted yaw.",
      facts: [
        "The 777's vertical stabilizer stands roughly 5.9 meters (over 19 ft) above the top of the fuselage — the tallest single structure on the aircraft.",
        "Airline tail livery — logos, flags, color schemes — is painted on the vertical stabilizer specifically because it's the most visible surface from the ground and in photographs.",
      ],
      role:
        "Directional (yaw) stability is one of the three axes covered on Flight Lab's Flight Dynamics page, alongside pitch and roll.",
      relatedAircraft: "Some aircraft, like early stealth designs, deliberately sacrifice vertical-stabilizer size for a smaller radar signature, trading stability for stealth — covered on Flight Lab's Military Aircraft page.",
    },
  },
  {
    id: "rudder",
    bind: "position",
    label: "Rudder",
    shortDescription: "The hinged trailing-edge panel on the vertical stabilizer, controlling yaw.",
    position: [23, 8, 0.5],
    radius: 2.5,
    cameraPosition: [30, 10, 7],
    cameraTarget: [23, 8, 0.5],
    tourOrder: 15,
    confidence: "estimated",
    content: {
      purpose:
        "The rudder deflects left or right to push the tail sideways, yawing the nose the opposite direction — used for coordinated turns, crosswind landings, and compensating for asymmetric thrust if an engine fails.",
      howItWorks:
        "Deflecting the rudder changes the effective airfoil shape of the vertical stabilizer, generating a sideways force. On a twin-engine airliner like the 777, the rudder has to be sized large enough to keep the aircraft controllable even if one engine fails at low speed just after takeoff — a specific, demanding certification requirement.",
      facts: [
        "Rudder input is normally applied through foot pedals, not the control column or sidestick.",
        "Losing an engine on one side creates strong asymmetric thrust; rudder authority to counteract that is a major factor in how large a twin-engine airliner's vertical tail has to be.",
      ],
      role:
        "The rudder is one of the three primary flight controls (with elevator and ailerons) covered on Flight Lab's Flight Dynamics page.",
      relatedAircraft: "Rudder sizing driven by engine-out certification is a big part of why twin-engine widebodies like the 777 and A350 have proportionally large vertical tails.",
    },
  },
  {
    id: "horizontal-stabilizer",
    bind: "position",
    label: "Horizontal Stabilizer",
    shortDescription: "The small horizontal tail wings, providing pitch stability and mounting the elevators.",
    position: [22.5, 4.6, 5],
    radius: 4,
    cameraPosition: [30, 8, 14],
    cameraTarget: [22.5, 4.6, 5],
    tourOrder: 16,
    confidence: "geometric",
    content: {
      purpose:
        "The horizontal stabilizer balances the aircraft in pitch — without it, the main wing's lift would tend to pitch the nose down (or up) uncontrollably.",
      howItWorks:
        "It normally produces a small downward force, not upward lift, which balances the nose-down pitching tendency created by the main wing. On the 777, the entire horizontal stabilizer can pivot (a trimmable stabilizer), letting the aircraft stay balanced across a wide range of speeds and loading conditions, with the elevator handling finer, faster pitch changes.",
      facts: [
        "The 777's horizontal stabilizer doubles as a fuel tank on some variants, part of the aircraft's overall fuel-volume strategy.",
        "A trimmable horizontal stabilizer means the elevator itself can stay closer to a neutral, low-drag position most of the time.",
      ],
      role:
        "Pitch stability, covered on Flight Lab's Flight Dynamics page, depends on this surface working correctly across the aircraft's entire speed and weight range.",
      relatedAircraft: "A trimmable horizontal stabilizer is standard across nearly all jet airliners, from the 737 to the A380.",
    },
  },
  {
    id: "elevator",
    bind: "position",
    label: "Elevator",
    shortDescription: "The hinged trailing-edge panel on the horizontal stabilizer, controlling pitch.",
    position: [24.5, 4.6, 5],
    radius: 2.2,
    cameraPosition: [31, 7, 12],
    cameraTarget: [24.5, 4.6, 5],
    tourOrder: 17,
    confidence: "estimated",
    content: {
      purpose:
        "The elevator deflects up or down to pitch the nose down or up — the primary control a pilot uses to climb, descend, or hold level flight.",
      howItWorks:
        "Deflecting the elevator up increases the tail's downward force, pitching the nose up; deflecting it down does the reverse. It works together with, but distinctly from, the trimmable horizontal stabilizer — the stabilizer sets a baseline pitch trim, and the elevator handles moment-to-moment adjustment.",
      facts: [
        "Elevator input is the most direct connection between the control column (or sidestick) and immediate aircraft response.",
        "On fly-by-wire aircraft like the 777, flight computers can limit elevator authority to keep the pilot from exceeding the aircraft's structural pitch limits.",
      ],
      role:
        "The elevator is one of the three primary flight controls (with rudder and ailerons) covered on Flight Lab's Flight Dynamics page.",
      relatedAircraft: "Some aircraft use an all-moving tailplane (stabilator) instead of a separate stabilizer and elevator — common on fighters, rare on airliners.",
    },
  },
  {
    id: "apu",
    bind: "position",
    label: "APU",
    shortDescription: "A small turbine in the tail cone, providing power independent of the main engines.",
    position: [25.7, 4, 0.5],
    radius: 1.8,
    cameraPosition: [32, 6, 6],
    cameraTarget: [25.7, 4, 0.5],
    tourOrder: 18,
    confidence: "estimated",
    content: {
      purpose:
        "The Auxiliary Power Unit supplies electricity and compressed air when the main engines aren't running — on the ground before pushback, or as backup power in flight.",
      howItWorks:
        "It's a small, self-contained gas turbine, essentially a miniature jet engine that drives a generator and an air compressor rather than producing thrust. Ground crews and the cabin's air conditioning depend on it during boarding, well before the main engines start.",
      facts: [
        "The APU is normally the first thing started and the last thing shut down on a given flight's ground operations.",
        "In flight, the APU can supply emergency electrical and pneumatic power if a main engine fails, part of the aircraft's broader redundancy philosophy.",
      ],
      role:
        "The APU is covered alongside hydraulics and pressurization on Flight Lab's Aircraft Systems page, under the same redundancy philosophy.",
      relatedAircraft: "Nearly every jet airliner larger than a regional jet carries an APU in the tail cone; it's one of the most universal design features in commercial aviation.",
    },
  },
];

export const boeing777300er: ModelExplorerConfig = {
  modelUrl: "/models/boeing-777-300er.glb",
  title: "Boeing 777-300ER",
  credit: {
    text: '"Boeing 777-300ER Model" by hakai315 is licensed under Creative Commons Attribution 4.0 (CC BY 4.0).',
    modelUrl: "https://skfb.ly/oSUMt",
    modelUrlLabel: "Boeing 777-300ER Model",
    author: "hakai315",
    licenseLabel: "CC BY 4.0",
    licenseUrl: "http://creativecommons.org/licenses/by/4.0/",
  },
  cameraDefault: {
    position: [60, 28, 65],
    target: [1.6, 4.2, 0.3],
  },
  controlsLimits: {
    minDistance: 12,
    maxDistance: 180,
  },
  guidedTourDwellMs: 7000,
  hotspots,
};

export default boeing777300er;
