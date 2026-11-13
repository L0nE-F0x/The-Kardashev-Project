/** Act III–V set pieces' footprints (pure: the layout and the tests read it without the art). */
import type { Act3PieceKind } from './plan';

/** Footprints (w × d) per kind, in world units (a campus plot is 28 × 26). */
export const ACT3_SIZE: Partial<Record<Act3PieceKind, [number, number]>> = {
  // Geneva: the Charter's headquarters
  secretariat: [52, 30], council: [36, 32], plaza: [30, 26], jetty: [22, 34],
  // megaprojects
  survey: [46, 32], seaSurvey: [46, 32], megaOffice: [20, 16], megaSub: [30, 24], converter: [36, 26],
  solarField: [50, 40], cspTower: [56, 56], storageYard: [30, 24], windField: [50, 40], windSea: [50, 40],
  seaSub: [22, 22], jackup: [28, 16], reactorUnit: [36, 32], pumpedHydro: [62, 64], geoPad: [30, 24],
  binaryPlant: [30, 24], megaBuild: [44, 34],
  // the launch complex
  vab: [40, 36], launchPad: [40, 40], tankFarm: [30, 24], launchSurvey: [60, 40],
  // Act IV
  fusionPlant: [44, 36], dacFarm: [40, 24],
  moonSurvey: [40, 30], moonHab: [30, 26], moonPad: [30, 30], rimSolar: [40, 24], iceRig: [30, 26], regolithMine: [40, 30],
  he3Plant: [30, 26], he3Tanks: [24, 20], massDriver: [90, 20], moonBuild: [34, 28],
  // Act V (on the Moon)
  moonFoundry: [40, 30],
  // Act V in space: the L4/L5 yards, Ring One (no ground: they float)
  yardsModule: [30, 26], yardsCopy: [30, 26], yardsOutbound: [34, 26], yardsDock: [30, 26], yardsBerth: [60, 30],
  ringRack: [26, 30], ringHub: [36, 34], ringHead: [30, 30],
  // Aurora, inside the habitat cylinder
  habHouses: [30, 24], habSchool: [28, 22], habPark: [30, 24], habFarm: [34, 26], habSquare: [26, 22], habDorms: [28, 22],
  habWorks: [30, 24], habTower: [22, 22], habVilla: [26, 22], habBuild: [28, 22],
  // asteroids
  astRocks: [30, 24], astBeacon: [16, 16], astClaim: [26, 22], astRig: [32, 28], astCatapult: [44, 24],
};
