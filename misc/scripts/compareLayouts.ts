import fs from "fs";

const files = process.argv.slice(2)

interface SlotLocation {
  slot: number
  offset: number
  size: number
  type: string
}

interface StorageEntry {
  contractName: string,
  name: string,
  slot: number,
  offset: number,
  type: string,
  size: number
}

interface StorageSpace {
  name: string,
  byteStart: number
  byteEnd: number
}

let contractUniverse = new Set<string>()

let storageLayout = new Array<StorageSpace>()
let variablesBySlots = new Map<string, SlotLocation>()

let hasConflicts = false

function verifyVariable (entry: StorageEntry) {
  const varKey = entry.name
  let loc = variablesBySlots.get(varKey)

  if (loc){
    if (loc.slot != entry.slot || loc.offset != entry.offset 
      || loc.type !== entry.type || loc.size != entry.size) {
      console.log("Mismatch for variable: " + entry)
      console.log(entry)
      console.log("Previous observeration:")
      console.log(loc)
      console.log("------------------------------------------------------")
      hasConflicts = true
    }
  } else {
    loc = { slot: entry.slot, offset: entry.offset, size: entry.size, type: entry.type }
    variablesBySlots.set(varKey, loc)
  }
}

function insidePoints (x: StorageSpace, y: StorageSpace) {
  return (x.byteStart >= y.byteStart && x.byteStart < y.byteEnd) ||
    (x.byteEnd > y.byteStart && x.byteEnd <= y.byteEnd) ||
    (y.byteStart >= x.byteStart && y.byteStart < x.byteEnd) ||
    (y.byteEnd > x.byteStart && y.byteEnd <= x.byteEnd)
}

function verifySpace (entry: StorageEntry) {
  const byteStart = entry.slot * 32 + entry.offset
  const byteEnd = byteStart + entry.size
  const space = { name: entry.name, byteStart: byteStart, byteEnd: byteEnd }
  storageLayout.map((prev: StorageSpace) => {
    if (space.name !== prev.name && insidePoints(space, prev)) {
      console.log("Space overlap: ")
      console.log(space)
      console.log("Conflicts with ")
      console.log(prev)
      console.log("------------------------------------------------------")
      hasConflicts = true
    }
  })
  storageLayout.push(space)
}

function main() {
  console.log()

  files.map((file: string) => {
    console.log("Checking layout snapshot: " + file)
    const entries = JSON.parse(fs.readFileSync(file, 'utf8'))
    entries["data"].map((entry: StorageEntry) => {
      contractUniverse.add(entry.contractName)
      verifyVariable(entry)
      verifySpace(entry)
    })
  })

  console.log()
  console.log("Contract Universe: ")
  contractUniverse.forEach((contract: string) => {
    console.log(contract)
  })
  console.log("-----------------------------------------------------------")

  if (!hasConflicts) {
    console.log()
    console.log("Success!")
    console.log("No conflicts found")
    console.log()
  } else {
    throw new Error("Conflicts found")
  }
}

main()


