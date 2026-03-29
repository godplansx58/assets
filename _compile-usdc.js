// Compile CustomUSDC contracts and output their bytecodes
const solc = require('solc');
const fs   = require('fs');
const path = require('path');

function compile(filename) {
  const src = fs.readFileSync(path.join(__dirname, 'contracts', filename), 'utf8');
  const contractName = filename.replace('.sol', '');

  const input = JSON.stringify({
    language: 'Solidity',
    sources:  { [filename]: { content: src } },
    settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } }
  });

  const out = JSON.parse(solc.compile(input));
  const errors = (out.errors || []).filter(e => e.severity === 'error');
  if (errors.length) {
    console.error('Compilation errors for', filename);
    errors.forEach(e => console.error(e.formattedMessage));
    return null;
  }

  const contract = out.contracts[filename][contractName];
  if (!contract) {
    // Try to find any contract in the file
    const contracts = out.contracts[filename];
    const key = Object.keys(contracts)[0];
    return { abi: contracts[key].abi, bytecode: '0x' + contracts[key].evm.bytecode.object };
  }
  return {
    abi:      contract.abi,
    bytecode: '0x' + contract.evm.bytecode.object
  };
}

const erc20 = compile('CustomUSDC.sol');
const trc20 = compile('CustomUSDC_TRC20_Mini.sol');

if (erc20) {
  console.log('=== CustomUSDC (ERC-20) BYTECODE ===');
  console.log(erc20.bytecode);
  console.log('');
}
if (trc20) {
  console.log('=== CustomUSDC_TRC20_Mini BYTECODE ===');
  console.log(trc20.bytecode);
  console.log('');
}
