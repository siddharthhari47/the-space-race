import type { HotspotConfig, ModelExplorerConfig } from "../types";

// Positions computed from a live console dump of each mesh's real
// world-space bounding box (see ExplorerShell.tsx's temporary debug
// block, run once against this model and removed afterward) — not
// hand-calculated from the source glTF's local accessor data. That
// distinction mattered here: unlike the Boeing model, this GLB's wrapper
// nodes carry real non-identity translation/rotation/scale (its "Body"
// node alone scales its local mesh data by ~39-100x per axis), so the
// raw accessor min/max bore no direct relationship to final world
// position. +X = tail (BackWing/BackProp/the rear of Body), -X = nose
// (Windows/Door), +Y = up, Z = lateral.
//
// This model has only 8 named mesh parts (Body, BodyTop, Prop, Sides,
// Windows, BackWing, BackProp, Door) — far coarser than the Boeing
// model's 430 nodes, and with no separate geometry at all for a
// swashplate, rotor hub, mast, engine bay, transmission, cockpit
// interior, or landing gear. Two consequences, both deliberate:
//
// 1. Several requested components that share one mesh (the rotor hub,
//    blades, and mast are all part of a single "Prop" mesh; the
//    vertical fin and horizontal stabilizer are both "BackWing") are
//    consolidated into one hotspot each, rather than several markers
//    that couldn't actually distinguish between parts of the same mesh.
//    Their distinct concepts still get covered — in the merged
//    hotspot's content, not as separate clickable dots with nothing
//    unique under them.
// 2. Landing Gear and Flight Controls were investigated and dropped —
//    there's no skid/wheel geometry anywhere in this model, and no
//    cockpit interior, so neither has any real position to point at.
//    Placing them anyway would be exactly what the brief asked not to
//    do: a generic dot with nothing under it.
//
// This model's overall bounding-box diagonal (~2850 units) is roughly
// 40x the Boeing model's (~66 units) — a different Sketchfab export's
// unit scale, not a real size difference.
const hotspots: HotspotConfig[] = [
  {
    id: "main-rotor",
    bind: "position",
    label: "Main Rotor",
    shortDescription: "The spinning assembly directly overhead — hub, mast, and blades — doing all of the lifting.",
    position: [-447, 295, -12],
    radius: 550,
    // Offset scaled to the rotor disc's own ~2450-unit bounding diagonal,
    // not a generic close-up distance — a small offset here put the
    // camera nearly inside the mesh (confirmed live: a flat, blank
    // close-up with no visible blades).
    cameraPosition: [673, 1835, 1668],
    cameraTarget: [-447, 295, -12],
    tourOrder: 1,
    confidence: "geometric",
    content: {
      purpose:
        "Everything about a helicopter's flight starts here. The rotor blades are shaped like a wing turned on its side — spin them fast enough through the air and they generate lift the same way a fixed wing does, except this wing never has to build up forward speed first.",
      howItWorks:
        "The mast is the driveshaft running up from the transmission into the rotor hub, and the hub is what holds the blades and lets each one flex and change pitch independently as it spins. A typical main rotor turns somewhere around 300-400 RPM — slow enough to see the individual blades if you tried, fast enough that each one is doing real aerodynamic work dozens of times a second.",
      facts: [
        "A helicopter's rotor blades are twisted along their length — steeper pitch near the root, flatter near the tip — because the tip is moving much faster through the air than the root and needs less angle to produce the same lift.",
        "In autorotation (engine failure), the rotor keeps spinning from airflow pushing up through it during a controlled descent — the same blades that generate lift powered can generate it unpowered, which is what makes a safe engine-out landing possible at all.",
      ],
      role: "The rotor is the engine's output made visible — every other system on this aircraft exists to either drive it, control it, or work around what it does to the airframe.",
    },
  },
  {
    id: "swashplate",
    bind: "position",
    label: "Swashplate",
    shortDescription: "The mechanism at the base of the mast that translates stick and lever input into blade pitch.",
    position: [-447, 180, -12],
    radius: 220,
    // Offset magnitude checked against BodyTop's own half-diagonal
    // (~877, since that's the host mesh a hotspot bound this close to it
    // will incidentally sit inside) — same class of "camera too close"
    // fix as Main Rotor needed.
    cameraPosition: [239, 611, 733],
    cameraTarget: [-447, 180, -12],
    tourOrder: 2,
    confidence: "estimated",
    content: {
      purpose:
        "A spinning rotor can't be steered by moving a normal linkage into it — the swashplate is the mechanical trick that gets a pilot's stationary control input onto blades that are rotating hundreds of times a minute.",
      howItWorks:
        "It's two rings stacked on the mast: a lower ring that doesn't rotate, connected to the pilot's controls, and an upper ring that spins with the rotor, connected to each blade. Raise the whole stack evenly — collective — and every blade's pitch increases by the same amount at every point in its rotation, so the whole disc produces more lift at once, and the helicopter climbs. Tilt the stack instead — cyclic — and each blade's pitch now depends on where it currently is in the rotation: more pitch (and more lift) on one side of the disc, less on the other. That uneven lift tips the whole rotor disc over, and the helicopter follows it — forward, back, or to either side, without the fuselage itself needing to bank into it the way an aircraft does.",
      facts: [
        "Cyclic control doesn't tilt the blades directly at the point you'd expect — because a spinning blade behaves like a gyroscope, the input has to be applied about 90 degrees earlier in the rotation than the direction you actually want the disc to tip.",
        "Igor Sikorsky's early helicopter designs struggled for years before a workable swashplate mechanism made controlled forward flight possible — the rotor problem, not the engine, was the hard part of inventing the helicopter.",
      ],
      role: "Every control input a pilot makes — climb, descend, move in any direction — passes through this one mechanism before it ever reaches a blade.",
    },
  },
  {
    id: "engine-transmission",
    bind: "position",
    label: "Engine & Transmission",
    shortDescription: "Turns fuel into rotor speed, and gears that speed down to something the mast can survive.",
    position: [-297, 220, -12],
    radius: 260,
    cameraPosition: [359, 689, 738],
    cameraTarget: [-297, 220, -12],
    tourOrder: 3,
    confidence: "estimated",
    content: {
      purpose:
        "A helicopter's engines and rotor want to spin at very different speeds, and the transmission's whole job is reconciling that difference without losing the enormous torque the rotor needs.",
      howItWorks:
        "Turboshaft engines like the ones on a Merlin run at somewhere around 20,000-25,000 RPM at their core — nowhere near a survivable speed for a rotor mast and blades that size. The main gearbox steps that down by a factor of roughly 100 to 1, so the rotor turns at a few hundred RPM instead. That gearbox is doing this continuously, under full engine power, for the entire flight, which is why it's one of the most heavily inspected components on any helicopter.",
      facts: [
        "Most twin-engine helicopters, including military Merlins, can lose one engine entirely and keep flying on the other — the gearbox combines both engines' output onto a single mast, so it doesn't care which engine the power came from.",
        "A helicopter's main gearbox is typically rated to keep the rotor turning for a set period even after it loses all its oil — a certified safety margin, not a coincidence, meant to give the crew time to find somewhere to land.",
      ],
      role: "Without this reduction, the engines' speed would tear the rotor apart; without the engines, the transmission has nothing to reduce.",
    },
  },
  {
    id: "tail-rotor",
    bind: "position",
    label: "Tail Rotor",
    shortDescription: "The small rotor on the tail fin, fighting the main rotor's tendency to spin the fuselage.",
    position: [750, 345, -30],
    radius: 260,
    cameraPosition: [1150, 695, 370],
    cameraTarget: [750, 345, -30],
    tourOrder: 4,
    confidence: "geometric",
    content: {
      purpose:
        "Spin a large mass fast enough and Newton's third law spins something back — without the tail rotor, the fuselage would simply rotate in the opposite direction of the main rotor, uncontrollably, the moment the engines started turning it.",
      howItWorks:
        "The tail rotor pushes sideways against the air, and that sideways thrust is what cancels the main rotor's reaction torque on the fuselage. Push the pedals and you're changing the tail rotor's blade pitch (the same collective-style idea as the main rotor, just applied sideways), which changes how much sideways thrust it makes — more thrust than needed and the nose yaws one way, less than needed and it yaws the other. In a steady hover it's constantly being fine-tuned, which is why hovering is one of the hardest things to learn to fly smoothly.",
      facts: [
        "Some helicopters replace the tail rotor entirely — NOTAR designs vent engine air out the tail boom instead, using the Coanda effect for the same anti-torque job with no exposed spinning blades.",
        "Losing tail rotor authority (not necessarily the rotor itself — sometimes just enough airflow disruption) is one of the most studied helicopter emergencies, precisely because the fuselage has nothing else stopping it from following the main rotor's torque.",
      ],
      role: "The main rotor makes lift and thrust; the tail rotor's entire purpose is making sure that effort doesn't just spin the cabin in circles instead of flying it forward.",
    },
  },
  {
    id: "tail-fin",
    bind: "position",
    label: "Tail Fin",
    shortDescription: "The fixed fin and stabilizer at the back, carrying the tail rotor and helping keep the tail steady in forward flight.",
    position: [493, 132, -52],
    radius: 300,
    cameraPosition: [893, 432, 298],
    cameraTarget: [493, 132, -52],
    confidence: "geometric",
    content: {
      purpose:
        "Once a helicopter has forward speed, the fin and stabilizer start doing some of the anti-torque work the tail rotor would otherwise have to handle alone — genuinely useful surfaces, not leftover fixed-wing styling.",
      howItWorks:
        "The vertical portion acts like a weathervane and a rudder combined: forward airflow over it produces a sideways force that helps counter main-rotor torque, meaning the tail rotor doesn't have to work as hard once the aircraft is moving. The smaller horizontal surface helps trim the fuselage's pitch attitude in cruise, the same basic idea as a fixed-wing tailplane, just doing far less work than the rotor disc above it.",
      facts: [
        "Because the fin offloads some anti-torque duty at speed, a well-designed tail rotor is often sized around the demands of a hover, not cruise flight — hovering is the harder case for it, not flying fast.",
        "The tail rotor is mounted on this same structure, which is why a hard strike to the tail fin on landing is treated as seriously as damage to the main rotor itself.",
      ],
      role: "Passive where the tail rotor is active — it doesn't need pedal input or power to help stabilize the tail, it just needs airflow.",
    },
  },
  {
    id: "tail-boom",
    bind: "position",
    label: "Tail Boom",
    shortDescription: "The long structural extension carrying the tail rotor drive shaft back from the main gearbox.",
    position: [450, 150, 0],
    radius: 350,
    cameraPosition: [1047, 663, 769],
    cameraTarget: [450, 150, 0],
    confidence: "estimated",
    content: {
      purpose:
        "The tail rotor is several meters from the engines that power it, and the boom is both the structure holding it out there and the housing for the long, thin drive shaft connecting the two.",
      howItWorks:
        "A tail rotor driveshaft has to run the full length of the boom at high RPM, supported by bearings spaced along its length, geared down again by a small gearbox right at the tail rotor itself. The boom also has to survive being a long lever arm — every bit of main-rotor torque the tail rotor is fighting gets transmitted as a bending and twisting load through this structure.",
      facts: [
        "A folding tail boom, common on naval helicopters including the Merlin, exists purely for shipboard storage — folding it shortens the aircraft's footprint enough to fit more airframes on a hangar deck.",
        "Tail boom strikes (rotor blades or the tail itself contacting the ground or an obstacle) are one of the most common serious ground-handling accidents in helicopter operations, precisely because the boom extends so far behind where the pilot is sitting.",
        "A small skid fitted low near the tail, easy to mistake for a tow point or an antenna, has one job: take the impact if the tail comes down too hard on landing, so the tail rotor itself never does.",
      ],
      role: "A long, awkward, unavoidable piece of structure — everything about the tail boom's design is a trade-off between keeping the tail rotor far enough away to be effective and not making the aircraft impossibly long.",
    },
  },
  {
    id: "fuselage",
    bind: "position",
    label: "Fuselage",
    shortDescription: "The main cabin structure — crew, passengers or cargo, and most of the aircraft's systems.",
    position: [66, -4, 0],
    radius: 300,
    cameraPosition: [566, 346, 550],
    cameraTarget: [66, -4, 0],
    tourOrder: 5,
    confidence: "geometric",
    content: {
      purpose:
        "Strip away the rotor and tail and what's left is essentially the load-carrying box — the part actually doing the job the mission calls for, whether that's troops, cargo, or search-and-rescue equipment.",
      howItWorks:
        "Unlike an airliner's fuselage, a helicopter's cabin doesn't need to be pressurized or built for sustained high-speed airflow — it's optimized instead for useful internal volume and for surviving the vibration a rotor overhead constantly puts into the airframe. Every helicopter fuselage is a compromise between keeping it light (weight the rotor has to lift) and keeping it strong enough for the loads a rotorcraft actually experiences, which are different from a fixed-wing aircraft's.",
      facts: [
        "A helicopter's empty weight fraction (structure weight versus useful load) is typically worse than a fixed-wing aircraft's, because so much of the airframe exists just to carry and control the rotor system overhead.",
        "Vibration from the rotor is transmitted directly into the fuselage at multiple frequencies (once per blade, per revolution), which is why helicopter cabins historically feel and sound very different from fixed-wing ones — a lot of engineering effort goes into damping it.",
        "The fuselage usually carries more antennae than its shape lets on: a loop antenna faired flush against the skin, a blade antenna on the belly, a whip further back on the tail boom, each tuned for a different radio system and placed to stay clear of the rotor disc and of each other.",
      ],
      role: "Everything else on this aircraft — rotor, engines, tail — exists to move this one structure and whatever's inside it from one place to another.",
    },
  },
  {
    id: "cockpit",
    bind: "position",
    label: "Cockpit",
    shortDescription: "The forward glazing where the flight crew sits, with the widest possible view for low-level flying.",
    position: [-800, 90, 0],
    radius: 220,
    cameraPosition: [-1150, 340, 400],
    cameraTarget: [-800, 90, 0],
    confidence: "estimated",
    content: {
      purpose:
        "Helicopters spend a lot of their working life close to the ground — landing in confined spaces, hovering over a spot, flying low along terrain — so the cockpit is built for visibility in a way a typical fixed-wing flight deck isn't.",
      howItWorks:
        "Large, deep windows (including down toward the pilot's feet on many helicopter types) let the crew see the ground close to the aircraft during a hover or landing, not just the horizon ahead. Two pilots typically share flying duties that would be one person's job in a fixed-wing cockpit — one flying, one watching instruments, obstacles, or a hoist operation outside — because low-level helicopter flying leaves very little margin for a single person to do everything at once.",
      facts: [
        "Search-and-rescue and naval helicopter cockpits are often designed so a pilot can see almost straight down without leaning out — critical for judging a hover position over water or a moving ship deck.",
        "Helicopter cockpit workload during a hover is genuinely different from cruise flight — small, continuous corrections on all the controls at once, which is a large part of why hovering takes so much longer to learn than forward flight.",
        "A pitot tube usually sits near the nose, often fitted with a small removable cover on the ground to keep insects and dust out — forget to remove it before flight and the airspeed indicator reads nothing at all.",
      ],
      role: "Every control this aircraft has — collective, cyclic, pedals — starts here, and the visibility built into this section is what makes flying it close to obstacles possible at all.",
    },
  },
  {
    id: "door",
    bind: "position",
    label: "Door",
    shortDescription: "The main side entry, sized for loading cargo, stretchers, or troops quickly.",
    position: [-617, 59, 0],
    radius: 150,
    cameraPosition: [-317, 309, 350],
    cameraTarget: [-617, 59, 0],
    tourOrder: 6,
    confidence: "geometric",
    content: {
      purpose:
        "A helicopter's door isn't just an entrance — on a utility or naval type like this one, it's sized and placed for whatever the mission actually needs to get in or out quickly: a stretcher, a hoist operator, cargo, or troops.",
      howItWorks:
        "Side doors are commonly built to slide rather than swing, since a swinging door needs clearance a busy helipad or ship deck often doesn't have, and a sliding door can be opened in flight for hoist operations or door-gunner positions without the airflow tearing it off its hinges. Placement matters too — far enough from the tail rotor to be safe to use on the ground, close enough to the center of the cabin to load evenly.",
      facts: [
        "Naval search-and-rescue helicopters routinely fly with the side door open in flight — the hoist operator needs a clear view and clear path straight down to whoever or whatever is being winched aboard.",
        "Door placement relative to the center of gravity matters more on a helicopter than it looks — loading heavy cargo through an off-center door can shift the aircraft's balance enough to affect how it handles in a hover.",
      ],
      role: "The practical link between the aircraft and whatever it was actually sent to do — everything else on this page is about flying it, this is about what it's flying for.",
    },
  },
];

export const merlinMk2Helicopter: ModelExplorerConfig = {
  modelUrl: "/models/merlin-mk2-helicopter.glb",
  title: "Merlin MK2 Helicopter",
  credit: {
    text: '"Merlin MK2 Helicopter" by sudreyskr is licensed under Creative Commons Attribution 4.0 (CC BY 4.0).',
    modelUrl: "https://skfb.ly/6VLMt",
    modelUrlLabel: "Merlin MK2 Helicopter",
    author: "sudreyskr",
    licenseLabel: "CC BY 4.0",
    licenseUrl: "http://creativecommons.org/licenses/by/4.0/",
  },
  cameraDefault: {
    position: [2327, 1243, 2781],
    target: [-196, 214, -12],
  },
  controlsLimits: {
    minDistance: 500,
    maxDistance: 8000,
  },
  guidedTourDwellMs: 7000,
  // The real cause of "I can't see anything": the default camera-to-target
  // distance here (~3900) plus this model's own radius (~1700) exceeds the
  // 500-unit-scale defaults for both fog-far and the camera's far clip
  // plane — the model was being rendered either 100% fog-colored or
  // silently clipped out of the frame entirely, not dimly lit. Fixed at
  // the source (fog/clip distances), not by lighting.
  fogDistance: { near: 2000, far: 10000 },
  cameraFar: 10000,
  // Between controlsLimits.maxDistance (8000, the farthest the camera can
  // orbit out to) and cameraFar (10000) — the camera needs to always stay
  // inside this sphere.
  skyRadius: 9000,
  // A real, secondary contributor: the shared lighting rig was tuned
  // against Boeing's flat matte, zero-texture materials, and this model's
  // real metallicRoughness textures reflect it more strongly. Kept as a
  // moderate reduction, not the aggressive one from the earlier (wrong)
  // diagnosis — verified against actual rendered pixel brightness, not
  // guessed.
  lightingIntensityScale: 0.6,
  // Per direct instruction: no rotor spin, no ground pad, no sky/clouds —
  // a static object with no environment dressing at all. Earlier attempts
  // at animation (rotor spin) and a grounded presentation (sky + ground
  // pad) each went through real, confirmed bugs before landing on
  // something correct, and re-verifying each one live in this environment
  // has been unreliable. This is the deliberately simple, low-risk
  // fallback: the model's own lighting/materials are untouched, only the
  // environment dressing is removed.
  showEnvironment: false,
  hotspots,
};

export default merlinMk2Helicopter;
