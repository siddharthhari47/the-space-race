import type { HotspotConfig, ModelExplorerConfig } from "../types";

// This model is authored at real-world scale: 1 unit = 1 metre. Verified
// against three independent dimensions of the actual aircraft, not assumed
// — the GLB's scene bounds are 21.42 long, 14.27 across, 5.92 tall, and a
// real Su-35 is 21.9 m long, 15.3 m span, 5.9 m tall. That agreement is
// what makes the estimated hotspots below defensible: they're placed from
// published aircraft dimensions against a model known to share them,
// rather than eyeballed.
//
// Axes, established from the geometry rather than guessed: -Z is the nose
// (the cockpit and canopy meshes sit at Z ~= -6.4), +Z is the tail, +Y is
// up, X is lateral with 0 on the centreline.
//
// The model has 15 mesh primitives but only 10 materials, and the entire
// airframe — fuselage, wings, both tails, intakes, engine housings — is a
// single mesh using one "chassis" material. So most structural hotspots
// here are position markers over one continuous surface, the same
// situation the Boeing 777 config deals with. What this model *does* give
// is meaningfully-named materials, and those produced real geometric
// evidence for six placements:
//
//   glass       -> canopy,            centred [0, 1.351, -6.438]
//   Cockpit.*   -> cockpit interior,  centred [0, 1.0, -6.5]
//   misc_a.2    -> landing gear, as three separate tall, narrow meshes:
//                  nose [0, -0.63, -4.37] and mains [+/-1.93, -0.87, 1.78]
//   missiles.0  -> underwing stores,  spanning 9.9 m across, below the wing
//   missiles.2  -> wingtip rails,     12.6 m across and only 0.5 m thick
//
// Everything else is marked "estimated" and placed from Su-35 anatomy.
const hotspots: HotspotConfig[] = [
  {
    id: "airframe",
    bind: "position",
    label: "The Airframe",
    shortDescription: "Start here: why a fighter is shaped nothing like the airliner you already explored.",
    position: [0, 0.5, -0.7],
    radius: 12,
    cameraPosition: [17, 9, -19],
    cameraTarget: [0, 0.5, -0.7],
    tourOrder: 1,
    confidence: "geometric",
    content: {
      purpose:
        "An airliner is designed around one dominant question: how do you move a lot of mass a long way on as little fuel as possible? A fighter is designed around a completely different one: how do you put an enormous amount of energy exactly where you want it, right now, and survive doing it. Almost every visible difference between this aircraft and the 777 comes out of that one change of priorities.",
      howItWorks:
        "Look at the proportions. The wing is small relative to the body, because a big efficient wing is also a wing that resists being thrown around. The whole fuselage is blended into the wing root rather than bolted to it, so the body itself contributes lift at high angles of attack. The engines sit at the back with nothing above them, because the exhaust has to leave cleanly at speeds an airliner never sees. On a 777 the shape is a compromise in favour of efficiency. Here it's a compromise in favour of control.",
      facts: [
        "This model is built to real scale: about 21.9 m long with a 15.3 m wingspan. A 777-300ER is 73.9 m long with a 64.8 m span, so you could park three Su-35s nose to tail inside one airliner's length and still have room left over.",
        "An Su-35's thrust-to-weight ratio at combat weight is greater than 1, meaning it can accelerate while pointing straight up. A loaded airliner's is roughly 0.25, which is exactly why one needs a runway and the other doesn't.",
      ],
      role: "Every other hotspot on this aircraft is a consequence of the trade this airframe makes. Efficiency lost, control gained.",
      relatedAircraft: "Compare directly with the Boeing 777-300ER in the Interactive Aircraft Explorer, built from a scan at the same real-world scale.",
    },
  },
  {
    id: "cockpit-canopy",
    bind: "position",
    label: "Cockpit & Canopy",
    shortDescription: "One seat, one pilot, and a bubble canopy built so they can see behind themselves.",
    position: [0, 1.2, -6.5],
    radius: 2.5,
    cameraPosition: [6, 4.5, -12],
    cameraTarget: [0, 1.2, -6.5],
    tourOrder: 2,
    confidence: "geometric",
    content: {
      purpose:
        "A fighter pilot needs to know where everything is relative to them, constantly, in three dimensions. That requirement shapes the canopy more than aerodynamics does: it sits high and clear on top of the fuselage instead of being faired smoothly into it, which costs real drag and gets accepted anyway.",
      howItWorks:
        "The canopy is a single-piece transparency with minimal framing, hinged to open upward. Sitting the pilot high enough to see over the nose and back over the shoulder is worth more than the drag saved by burying them in the fuselage. Inside, the seat is reclined, which sounds like a comfort decision and isn't: leaning back raises the g-force a pilot can take before blood drains out of their head and they grey out.",
      facts: [
        "The canopy mesh on this model is 2.74 m long, which is roughly a third of the distance from the nose to the wing root. On an airliner the flight deck windows are a fraction of that proportion.",
        "A modern ejection seat can fire successfully at zero altitude and zero speed, sitting still on the runway, and still get the pilot high enough for a parachute to open.",
      ],
      role: "The single most drag-expensive shape decision on the aircraft, made because situational awareness matters more than a few percent of fuel burn.",
    },
  },
  {
    id: "nose-radar",
    bind: "position",
    label: "Nose & Radar",
    shortDescription: "A radome, not a nose cone, and the reason it's a different material from everything around it.",
    position: [0, 0.4, -10.2],
    radius: 2.2,
    cameraPosition: [6, 3, -15.5],
    cameraTarget: [0, 0.4, -10.2],
    tourOrder: 3,
    confidence: "estimated",
    content: {
      purpose:
        "The nose houses the radar, and everything about its shape is a compromise between being aerodynamically sharp and being radio-transparent. Point the aircraft somewhere and you're also pointing the radar, which is why a fighter's nose is essentially a container for a sensor.",
      howItWorks:
        "The radome is made from a composite that radar energy passes through, unlike the metal and carbon fibre making up the rest of the airframe. Behind it sits an antenna that sweeps a beam across a volume of sky ahead, listens for reflections, and works out range and closing speed from what comes back. The Su-35 uses a passive electronically scanned array, which steers its beam electronically rather than by physically slewing a dish.",
      facts: [
        "The same physics constraint applies to airliners. A 777's nose radome is one of the very few parts of that aircraft not made from a radar-reflective material, for exactly the same reason.",
        "Radar range figures published for any operational fighter should be treated with caution. They depend heavily on the size of what's being detected, and the numbers quoted publicly are rarely measured under the same conditions.",
      ],
      role: "The aircraft's primary long-range sensor. Everything the pilot knows about anything more than a few kilometres away starts here.",
      relatedAircraft: "The 777's nose serves the same radar-transparency requirement for weather radar rather than target tracking.",
    },
  },
  {
    id: "air-intakes",
    bind: "position",
    label: "Air Intakes",
    shortDescription: "Rectangular, not round, and positioned to keep feeding the engines even when the nose is pointed way up.",
    position: [1.35, -0.75, -3.2],
    radius: 2.6,
    cameraPosition: [8.5, 1.5, -9],
    cameraTarget: [1.35, -0.75, -3.2],
    tourOrder: 4,
    confidence: "estimated",
    content: {
      purpose:
        "A jet engine is fussy about the air it's fed. It wants a smooth, subsonic, evenly-distributed flow arriving at the compressor face, and it wants that regardless of whether the aircraft is doing 200 km/h on approach or well past the speed of sound with its nose 30 degrees off the airflow.",
      howItWorks:
        "The intake's job is to slow incoming air down and even it out before the engine ever sees it. At supersonic speeds that means deliberately creating shock waves inside the duct to drop the flow below Mach 1, which is why the opening is a rectangle with adjustable internal surfaces rather than a simple round hole. Get this wrong and the compressor stalls: airflow through the engine breaks down, and it can happen violently.",
      facts: [
        "The intakes sit under the wing root extensions rather than on the nose, so that at high angles of attack the forebody helps turn airflow down into them instead of letting it separate.",
        "Su-27 family aircraft, which the Su-35 developed from, carry retractable mesh screens in the intakes to stop debris being ingested during takeoff and landing from rough strips.",
      ],
      role: "The first component in the propulsion chain, and the one most likely to ruin the engine's day if it gets the airflow wrong.",
    },
  },
  {
    id: "engines",
    bind: "position",
    label: "Twin Engines",
    shortDescription: "Two engines set wide apart, each one an afterburning turbofan.",
    position: [0, -0.1, 6.5],
    radius: 4,
    cameraPosition: [10, 5, 14.5],
    cameraTarget: [0, -0.1, 6.5],
    tourOrder: 5,
    confidence: "estimated",
    content: {
      purpose:
        "Two engines, spaced well apart with a tunnel between them, rather than one bigger engine on the centreline. That spacing is deliberate: it leaves room for stores between them, gives redundancy if one is damaged, and puts each nozzle far enough off the centreline to do something useful when they point in different directions.",
      howItWorks:
        "Each is a low-bypass afterburning turbofan. The 'low bypass' part is the key difference from an airliner. A 777's engine sends most of its air *around* the core, which is quiet and efficient at cruise. A fighter sends most of its air *through* the core, which is louder and thirstier but produces far more thrust for the frontal area, and leaves a hot, fast exhaust an afterburner can do something with.",
      facts: [
        "Each Su-35 engine produces roughly 86 kN of dry thrust and about 142 kN with the afterburner lit. That's a 65 percent increase from one system, and it can be commanded in about a second.",
        "The tunnel between the engines isn't wasted space. On the Su-27 family it carries fuel and stores, and contributes lift of its own at high angles of attack.",
      ],
      role: "The energy source for everything the airframe is designed to do. Thrust here is what makes the manoeuvrability everywhere else possible.",
      relatedAircraft: "The 777's GE90 is the opposite design philosophy taken to its extreme: enormous bypass ratio, tuned entirely for efficient cruise.",
    },
  },
  {
    id: "afterburner",
    bind: "position",
    label: "Afterburner & Nozzles",
    shortDescription: "Where fuel gets dumped into the exhaust, and where the nozzles can point off-centre.",
    position: [0.95, -0.2, 9.2],
    radius: 2.4,
    cameraPosition: [7, 3, 16.5],
    cameraTarget: [0.95, -0.2, 9.2],
    tourOrder: 6,
    confidence: "estimated",
    content: {
      purpose:
        "A jet engine's exhaust still contains a lot of unused oxygen, because the core only burns a fraction of the air passing through it. An afterburner exploits that: spray raw fuel into the exhaust stream behind the turbine, light it, and get a large, immediate thrust increase from hardware you're already carrying.",
      howItWorks:
        "Fuel sprays into the jet pipe aft of the turbine and burns in the exhaust flow, raising its temperature and velocity before it leaves the nozzle. The nozzle itself has to open wider at the same time to handle the increased flow, which is why the petals at the back of a fighter visibly change diameter. It is spectacularly inefficient. Afterburner can more than double fuel consumption for a thrust increase of roughly 50 to 65 percent, so it gets used in seconds and minutes, not hours.",
      facts: [
        "The Su-35's nozzles can also swivel, which is what 'thrust vectoring' means: pointing the exhaust off the centreline to push the tail sideways or up, generating a control moment that doesn't rely on airflow over a control surface at all.",
        "That matters most exactly where conventional controls fail. At very low airspeed or very high angle of attack there isn't enough airflow for a rudder or elevator to bite, but the engine is still producing thrust, so vectoring still works.",
      ],
      role: "The difference between an aircraft that manoeuvres using the air around it and one that can also manoeuvre using the exhaust behind it.",
    },
  },
  {
    id: "wings",
    bind: "position",
    label: "Wings & Leading-Edge Extensions",
    shortDescription: "A swept wing blended into the fuselage, with the body itself doing part of the lifting.",
    position: [4.3, -0.05, 2.3],
    radius: 4.5,
    cameraPosition: [13, 7.5, -2.5],
    cameraTarget: [4.3, -0.05, 2.3],
    tourOrder: 7,
    confidence: "estimated",
    content: {
      purpose:
        "The wing has to make enough lift to fly, survive being pulled to nine times the aircraft's own weight in a hard turn, and not lose its grip on the airflow when the nose is pointed far away from the direction of travel. Those three demands pull in different directions, and the blended shape is the compromise.",
      howItWorks:
        "The leading edge sweeps back sharply and blends into the fuselage rather than meeting it at a joint. Those blended extensions ahead of the wing root do something specific at high angle of attack: they shed a strong vortex that runs back over the wing's upper surface, and that vortex keeps airflow attached where it would otherwise have separated. It's a way of delaying the stall well past where a conventional wing would give up.",
      facts: [
        "A 777's wing is built to bend and flex efficiently across a narrow band of cruise conditions. This wing is built to keep working at angles of attack where an airliner's wing would have stalled long ago.",
        "The trade is visible in the numbers. An airliner cruises at a few degrees of angle of attack; controlled flight at 30 degrees or more is a normal part of this aircraft's envelope.",
      ],
      role: "Lift, load-bearing structure, and the mounting point for most of what the aircraft carries, all in one surface.",
      relatedAircraft: "Flight Lab's Aerodynamics page covers the stall and angle-of-attack physics this wing is built to push against.",
    },
  },
  {
    id: "vertical-stabilizers",
    bind: "position",
    label: "Twin Vertical Stabilizers",
    shortDescription: "Two fins instead of one, and not just for redundancy.",
    position: [2.3, 2.3, 5.8],
    radius: 3,
    cameraPosition: [10, 6.5, 13],
    cameraTarget: [2.3, 2.3, 5.8],
    tourOrder: 8,
    confidence: "estimated",
    content: {
      purpose:
        "Directional stability is what stops an aircraft from wandering off the direction it's actually travelling. A single tall fin does that job on an airliner. A fighter that spends time at high angles of attack has a problem with one: the fuselage ahead of it blankets the fin in disturbed air exactly when stability is most needed.",
      howItWorks:
        "Splitting the fin in two and moving each one outboard puts them in cleaner air at high angles of attack, where a centreline fin would be sitting in the fuselage's wake. Two shorter fins also reduce the aircraft's overall height, which matters for hangar and shelter clearance. Each carries its own rudder for yaw control.",
      facts: [
        "The twin-fin layout is close to universal on modern fighters, and the reason is high-angle-of-attack behaviour rather than redundancy, though the redundancy is a welcome side effect.",
        "Stealth designs sometimes cant their fins sharply outward, trading some aerodynamic efficiency for a lower radar return, since vertical flat surfaces are excellent radar reflectors.",
      ],
      role: "Keeps the aircraft pointed where it's going, in a flight regime where a single conventional fin would stop working.",
    },
  },
  {
    id: "horizontal-stabilizers",
    bind: "position",
    label: "Horizontal Stabilizers",
    shortDescription: "All-moving tailplanes: the whole surface pivots, not just a hinged flap on the back.",
    position: [3.2, 0.1, 7.2],
    radius: 3,
    cameraPosition: [11, 4, 13.5],
    cameraTarget: [3.2, 0.1, 7.2],
    tourOrder: 9,
    confidence: "estimated",
    content: {
      purpose:
        "Pitch control, but implemented differently from an airliner. On a 777 a fixed horizontal stabilizer carries a hinged elevator on its trailing edge. Here the entire horizontal surface rotates as one piece.",
      howItWorks:
        "An all-moving tailplane, sometimes called a stabilator, changes the angle of the whole surface rather than deflecting a flap at the back of it. That gives far more pitch authority for the same area, and it keeps working at supersonic speed where a hinged elevator loses much of its effect. These can also move differentially, one leading edge up while the other goes down, which produces roll as well as pitch from the same pair of surfaces.",
      facts: [
        "Hinged elevators lose effectiveness above Mach 1 because the shock wave forming on the surface interferes with the flow over the hinged section. All-moving surfaces sidestep the problem, which is why supersonic aircraft almost universally use them.",
        "Using them differentially means this aircraft has three separate ways to roll: ailerons, differential tailplanes, and thrust vectoring.",
      ],
      role: "The primary pitch control, and a secondary roll control, on a design that needs both to keep working past the speed of sound.",
      relatedAircraft: "Flight Lab's Aircraft Systems page covers the conventional stabilizer-plus-elevator arrangement this replaces.",
    },
  },
  {
    id: "landing-gear",
    bind: "position",
    label: "Landing Gear",
    shortDescription: "Tricycle gear, built shorter and tougher than an airliner's for a very different landing.",
    position: [0, -0.9, -4.37],
    radius: 2.2,
    cameraPosition: [6.5, -0.5, -9],
    cameraTarget: [0, -0.9, -4.37],
    tourOrder: 10,
    confidence: "geometric",
    content: {
      purpose:
        "Supports the aircraft on the ground, absorbs the landing, and then gets out of the airflow as fast as possible. On this model the gear is three separate meshes, each a tall narrow strut: one on the centreline forward, and two further back under the wing roots.",
      howItWorks:
        "Same oleo-pneumatic principle as any other aircraft, a piston working against compressed gas and hydraulic fluid, but tuned for a harder arrival. Fighters routinely land at higher sink rates than airliners, deliberately, because a firm touchdown on a short runway beats floating down it. Carrier-based fighters take this furthest, with gear built to survive what is essentially a controlled crash.",
      facts: [
        "The nose gear on Su-27 family aircraft sits well aft of the radome, roughly under the cockpit, rather than right at the nose. You can see that clearly on this model: it's about 7 m back from the nose tip.",
        "A 777's main gear carries six wheels per side to spread its weight across the runway. A fighter needs one or two, because there's an order of magnitude less aircraft to hold up.",
      ],
      role: "Only in use for a few minutes per flight, and structurally sized by those few minutes rather than by everything else the aircraft does.",
    },
  },
  {
    id: "hardpoints",
    bind: "position",
    label: "Hardpoints & Stores",
    shortDescription: "The mounting points under the wings and fuselage, and what carrying things there costs.",
    position: [3.5, -0.9, 1.5],
    radius: 3.2,
    cameraPosition: [9.5, -1, -3.5],
    cameraTarget: [3.5, -0.9, 1.5],
    tourOrder: 11,
    confidence: "geometric",
    content: {
      purpose:
        "Hardpoints are structural attachment points that let the aircraft carry things externally: fuel tanks, sensor pods, or weapons. On this model they're clearly visible as separate meshes spanning nearly 10 m under the wings, plus rails right at the wingtips.",
      howItWorks:
        "Everything hung outside the airframe costs drag and weight, and changes how the aircraft handles. A configuration loaded for a long-range mission flies noticeably differently from a clean one, which is why pilots train for specific loadouts rather than treating the aircraft as one fixed set of numbers. Wingtip rails are a special case: putting mass right at the tip changes the wing's bending and flutter behaviour, so those stations get designed around from the start.",
      facts: [
        "External carriage is the fundamental compromise stealth aircraft avoid by carrying stores internally. Internal bays cost volume and complexity, but a clean external surface is worth a great deal to a radar cross-section.",
        "Drop tanks exist to be dropped. Once the fuel in them is gone they're pure drag, so the aircraft is designed to jettison them rather than carry empty ones home.",
      ],
      role: "Where the aircraft's mission actually gets attached. Everything else here is about flying; this is about what it's flying for.",
    },
  },
];

export const sukhoiSu35Fighter: ModelExplorerConfig = {
  modelUrl: "/models/sukhoi-su35-fighter.glb",
  title: "Sukhoi Su-35 Fighter Jet",
  credit: {
    text: '"Sukhoi SU-35 Fighter Jet" by Muhamad Mirza Arrafi is licensed under Creative Commons Attribution 4.0 (CC BY 4.0).',
    modelUrl: "https://skfb.ly/pwSpn",
    modelUrlLabel: "Sukhoi SU-35 Fighter Jet",
    author: "Muhamad Mirza Arrafi",
    licenseLabel: "CC BY 4.0",
    licenseUrl: "http://creativecommons.org/licenses/by/4.0/",
  },
  // Framed to show the whole 21 m airframe three-quarters-on from the front
  // left, which is the angle that makes the wing sweep and the twin tails
  // read most clearly at a glance.
  cameraDefault: {
    position: [17, 9, -19],
    target: [0, 0.5, -0.7],
  },
  // Scaled to this model's own size (~26 unit diagonal), not Boeing's
  // (~66). minDistance keeps the camera outside the airframe on a full
  // zoom-in; maxDistance stays well inside the sky sphere.
  controlsLimits: {
    minDistance: 5,
    maxDistance: 70,
  },
  guidedTourDwellMs: 8000,
  // Verified: every material in the shipped GLB still carries its source
  // metallicFactor of 0 after the Draco pass, so this model does NOT need
  // the forceZeroMetalness correction the Boeing config applies.
  hotspots,
};

export default sukhoiSu35Fighter;
