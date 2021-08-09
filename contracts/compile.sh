#!/usr/bin/bash -eu

srcDir=$(dirname $(readlink -f $0))

bldDir=$srcDir/bld/
mkdir -p $bldDir/hex/ $bldDir/abi/

flags="--overwrite --optimize"

solc $flags --abi -o $bldDir/abi/ *.sol
solc $flags --bin -o $bldDir/hex/ *.sol
solc $flags --bin-runtime -o $bldDir/hex/ *.sol

ls $bldDir/abi/*.abi \
    | sed 's+\(.*\)[.]abi$+cp & \1.json+' \
    | bash

function listBins() {
    ls $bldDir/hex/*.bin \
       $bldDir/hex/*.bin-runtime
}

for binPath in $(listBins); do
    (echo -n '{"bin":"';
     cat $binPath;
     echo '"}') \
        > $binPath.json
done

