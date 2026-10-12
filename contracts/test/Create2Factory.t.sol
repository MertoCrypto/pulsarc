// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../script/Create2Factory.sol";
import "../ArcToken.sol";

// ---------------------------------------------------------------------------
// Helpers – minimal contracts used as deploy payloads
// ---------------------------------------------------------------------------

/// @dev Records msg.value received by its constructor (payable).
contract ValueSink {
    uint256 public received;
    constructor() payable { received = msg.value; }
}

/// @dev Constructor always reverts.
contract AlwaysReverts {
    constructor() { revert("nope"); }
}

// ---------------------------------------------------------------------------
// Main test suite
// ---------------------------------------------------------------------------

contract Create2FactoryTest is Test {
    Create2Factory internal factory;

    // Typical ArcToken constructor args used across multiple tests
    string  constant NAME   = "ArcToken";
    string  constant SYMBOL = "ARC";
    uint256 constant SUPPLY = 1_000_000e18;

    function setUp() public {
        factory = new Create2Factory();
    }

    // -----------------------------------------------------------------------
    // Helper – build ArcToken initCode for a given owner
    // -----------------------------------------------------------------------
    function _arcTokenInitCode(address owner_) internal pure returns (bytes memory) {
        return abi.encodePacked(
            type(ArcToken).creationCode,
            abi.encode(NAME, SYMBOL, SUPPLY, owner_)
        );
    }

    // -----------------------------------------------------------------------
    // 1. computeAddress matches the address returned by deploy
    // -----------------------------------------------------------------------
    function test_computeAddress_matchesDeploy() public {
        address owner = makeAddr("owner");
        bytes memory initCode = _arcTokenInitCode(owner);
        bytes32 salt = keccak256("salt-1");
        bytes32 initCodeHash = keccak256(initCode);

        address predicted = factory.computeAddress(salt, initCodeHash);
        address actual    = factory.deploy(salt, initCode);

        assertEq(predicted, actual, "computeAddress != deploy return");
    }

    // -----------------------------------------------------------------------
    // 2. Deployed event emits correct indexed topics
    // -----------------------------------------------------------------------
    function test_deployEmitsEvent() public {
        address owner = makeAddr("owner2");
        bytes memory initCode = _arcTokenInitCode(owner);
        bytes32 salt = keccak256("salt-event");
        bytes32 initCodeHash = keccak256(initCode);

        address predicted = factory.computeAddress(salt, initCodeHash);

        // checkTopic1=true (deployedAddress), checkTopic2=true (salt), checkData=false
        vm.expectEmit(true, true, false, false, address(factory));
        emit Create2Factory.Deployed(predicted, salt);

        factory.deploy(salt, initCode);
    }

    // -----------------------------------------------------------------------
    // 2b. Event address matches computeAddress – verified via recordLogs
    //     Use ValueSink (no sub-events) so the factory emits exactly one log.
    // -----------------------------------------------------------------------
    function test_deployEmitsEvent_recordLogs() public {
        bytes memory initCode = type(ValueSink).creationCode;
        bytes32 salt = keccak256("salt-logs");
        bytes32 initCodeHash = keccak256(initCode);

        address predicted = factory.computeAddress(salt, initCodeHash);

        vm.recordLogs();
        address deployed = factory.deploy(salt, initCode);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // Exactly one log from the factory (ValueSink emits nothing)
        assertEq(logs.length, 1, "expected 1 log");
        // topics[0] = event sig, topics[1] = deployedAddress, topics[2] = salt
        assertEq(logs[0].topics[0], keccak256("Deployed(address,bytes32)"), "wrong event sig");
        assertEq(address(uint160(uint256(logs[0].topics[1]))), deployed,   "log addr != deployed");
        assertEq(address(uint160(uint256(logs[0].topics[1]))), predicted,  "log addr != predicted");
        assertEq(logs[0].topics[2], salt, "log salt mismatch");
    }

    // -----------------------------------------------------------------------
    // 3. Same salt + initCode twice reverts
    // -----------------------------------------------------------------------
    function test_duplicateSaltReverts() public {
        address owner = makeAddr("owner3");
        bytes memory initCode = _arcTokenInitCode(owner);
        bytes32 salt = keccak256("salt-dup");

        factory.deploy(salt, initCode);

        vm.expectRevert();
        factory.deploy(salt, initCode);
    }

    // -----------------------------------------------------------------------
    // 4. Different salt gives different address
    // -----------------------------------------------------------------------
    function test_differentSalt_differentAddress() public {
        address owner = makeAddr("owner4");
        bytes memory initCode = _arcTokenInitCode(owner);

        address a1 = factory.deploy(keccak256("saltA"), initCode);
        address a2 = factory.deploy(keccak256("saltB"), initCode);

        assertTrue(a1 != a2, "different salts should give different addresses");
    }

    // -----------------------------------------------------------------------
    // 5. Different constructor args (same salt) give different address
    // -----------------------------------------------------------------------
    function test_differentArgs_differentAddress() public {
        bytes32 salt = keccak256("salt-args");

        bytes memory code1 = _arcTokenInitCode(makeAddr("ownerA"));
        bytes memory code2 = _arcTokenInitCode(makeAddr("ownerB"));

        address a1 = factory.deploy(salt, code1);

        // salt is already used with code1; use the same salt but the second
        // initCode is different, so the CREATE2 address is different – it should succeed
        address a2 = factory.deploy(salt, code2);

        assertTrue(a1 != a2, "different args should give different addresses");
    }

    // -----------------------------------------------------------------------
    // 6. Deployed code is non-empty and msg.sender seen by child is the factory
    // -----------------------------------------------------------------------
    function test_deployedCodeNonEmpty_senderIsFactory() public {
        address tokenOwner = makeAddr("tokenOwner");
        bytes memory initCode = _arcTokenInitCode(tokenOwner);
        bytes32 salt = keccak256("salt-nonempty");

        address deployed = factory.deploy(salt, initCode);

        // Non-empty code
        assertTrue(deployed.code.length > 0, "deployed code is empty");

        // Constructor msg.sender is the factory, but balances go to the explicit owner_,
        // not to msg.sender (the factory).
        ArcToken token = ArcToken(deployed);
        assertEq(token.balanceOf(tokenOwner), SUPPLY, "owner did not receive supply");
        assertEq(token.balanceOf(address(factory)), 0, "factory should have 0 balance");
    }

    // -----------------------------------------------------------------------
    // 7. Payable: ETH forwarded to child's constructor
    // -----------------------------------------------------------------------
    function test_payable_ethForwardedToChild() public {
        bytes memory initCode = type(ValueSink).creationCode;
        bytes32 salt = keccak256("salt-payable");
        uint256 value = 1 ether;

        vm.deal(address(this), value);
        address deployed = factory.deploy{value: value}(salt, initCode);

        assertEq(deployed.balance, value, "child balance != sent value");
        assertEq(address(factory).balance, 0, "factory should hold no ETH");
    }

    // -----------------------------------------------------------------------
    // 8. Empty bytecode reverts with OZ Create2EmptyBytecode
    // -----------------------------------------------------------------------
    function test_emptyBytecode_reverts() public {
        bytes32 salt = keccak256("salt-empty");
        vm.expectRevert(
            abi.encodeWithSelector(bytes4(keccak256("Create2EmptyBytecode()")))
        );
        factory.deploy(salt, "");
    }

    // -----------------------------------------------------------------------
    // 9. Constructor that reverts bubbles up the inner revert reason.
    //    OZ 5.1.0 Create2.deploy forwards the returndata directly when the
    //    child constructor reverts with data, so we see the string "nope".
    // -----------------------------------------------------------------------
    function test_revertingConstructor_reverts() public {
        bytes memory initCode = type(AlwaysReverts).creationCode;
        bytes32 salt = keccak256("salt-revert");
        vm.expectRevert(abi.encodeWithSignature("Error(string)", "nope"));
        factory.deploy(salt, initCode);
    }

    // -----------------------------------------------------------------------
    // 10. Address is independent of caller
    // -----------------------------------------------------------------------
    function test_addressIndependentOfCaller() public {
        address alice = makeAddr("alice");
        address bob   = makeAddr("bob");

        bytes memory initCode = _arcTokenInitCode(makeAddr("owner-caller"));
        bytes32 salt = keccak256("salt-caller");
        bytes32 initCodeHash = keccak256(initCode);

        // Both EOAs see the same predicted address from the SAME factory
        address predictedAlice = factory.computeAddress(salt, initCodeHash);
        address predictedBob   = factory.computeAddress(salt, initCodeHash);
        assertEq(predictedAlice, predictedBob, "predictions should match");

        // Alice deploys
        vm.prank(alice);
        address deployed = factory.deploy(salt, initCode);
        assertEq(deployed, predictedAlice, "alice deployed wrong address");

        // Bob's identical call (same factory, same salt, same code) reverts
        vm.prank(bob);
        vm.expectRevert();
        factory.deploy(salt, initCode);
    }

    // -----------------------------------------------------------------------
    // 11. computeAddress is a pure function – fuzz against manual formula
    // -----------------------------------------------------------------------
    function testFuzz_computeAddress_matchesManualFormula(bytes32 salt) public view {
        // Use a fixed literal address so the function remains view-compatible.
        bytes memory initCode = _arcTokenInitCode(address(0xBEEF));
        bytes32 initCodeHash  = keccak256(initCode);

        address fromFactory = factory.computeAddress(salt, initCodeHash);
        address manual = address(
            uint160(uint256(keccak256(
                abi.encodePacked(bytes1(0xff), address(factory), salt, initCodeHash)
            )))
        );
        assertEq(fromFactory, manual, "computeAddress != manual keccak formula");
    }

    // -----------------------------------------------------------------------
    // 12. Fuzz: predicted address always equals actual deployed address
    // -----------------------------------------------------------------------
    function testFuzz_predictedEqualsDeployed(bytes32 salt) public {
        // Use ValueSink (tiny, no-arg constructor) to keep gas low during fuzzing
        bytes memory initCode    = type(ValueSink).creationCode;
        bytes32 initCodeHash     = keccak256(initCode);

        address predicted = factory.computeAddress(salt, initCodeHash);
        address actual    = factory.deploy(salt, initCode);

        assertEq(predicted, actual, "fuzz: predicted != deployed");
    }
}
