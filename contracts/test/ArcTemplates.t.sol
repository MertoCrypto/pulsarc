// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../ArcToken.sol";
import "../ArcNFT.sol";
import "../ArcMultiToken.sol";

// ---------------------------------------------------------------------------
// Minimal CREATE2 factory used throughout the test suite.
// ---------------------------------------------------------------------------
contract MiniFactory {
    event Deployed(address indexed addr);

    function deploy(bytes32 salt, bytes memory initCode) external returns (address addr) {
        assembly {
            addr := create2(0, add(initCode, 0x20), mload(initCode), salt)
        }
        require(addr != address(0), "create2 failed");
        emit Deployed(addr);
    }
}

// ---------------------------------------------------------------------------
// ERC-1155 receiver stub so the factory can receive safeTransferFrom
// ---------------------------------------------------------------------------
contract ERC1155Receiver {
    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return 0xf23a6e61;
    }
    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return 0xbc197c81;
    }
    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0xf23a6e61 || id == 0xbc197c81 || id == 0x01ffc9a7;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function predictCreate2(address factory, bytes32 salt, bytes memory initCode) pure returns (address) {
    return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), factory, salt, keccak256(initCode))))));
}

function toString(uint256 v) pure returns (string memory) {
    if (v == 0) return "0";
    uint256 temp = v;
    uint256 digits;
    while (temp != 0) { digits++; temp /= 10; }
    bytes memory buf = new bytes(digits);
    while (v != 0) { digits--; buf[digits] = bytes1(uint8(48 + v % 10)); v /= 10; }
    return string(buf);
}

// ===========================================================================
// ArcToken tests
// ===========================================================================
contract ArcTokenTest is Test {
    MiniFactory factory;
    address owner = makeAddr("owner");

    function setUp() public {
        factory = new MiniFactory();
    }

    // --- CREATE2 address prediction and ownership --------------------------

    function test_create2_addressPrediction() public {
        bytes32 salt = keccak256("arc-token-v1");
        bytes memory init = abi.encodePacked(
            type(ArcToken).creationCode,
            abi.encode("ArcToken", "ARC", uint256(1_000_000e18), owner)
        );
        address predicted = predictCreate2(address(factory), salt, init);
        address deployed  = factory.deploy(salt, init);
        assertEq(deployed, predicted, "CREATE2 address mismatch");
    }

    function test_create2_factoryHoldsNothing() public {
        bytes32 salt = keccak256("arc-token-v2");
        uint256 supply = 500e18;
        bytes memory init = abi.encodePacked(
            type(ArcToken).creationCode,
            abi.encode("ArcToken", "ARC", supply, owner)
        );
        address deployed = factory.deploy(salt, init);
        ArcToken tok = ArcToken(deployed);
        assertEq(tok.balanceOf(address(factory)), 0, "factory must hold 0");
        assertEq(tok.balanceOf(owner), supply,        "owner must hold supply");
    }

    // --- Basic properties --------------------------------------------------

    function test_nameSymbolDecimals() public {
        ArcToken tok = new ArcToken("My Token", "MTK", 1e18, owner);
        assertEq(tok.name(),     "My Token");
        assertEq(tok.symbol(),   "MTK");
        assertEq(tok.decimals(), 18);
    }

    function test_totalSupplyEqualsInitialSupply() public {
        uint256 supply = 42e18;
        ArcToken tok = new ArcToken("T", "T", supply, owner);
        assertEq(tok.totalSupply(), supply);
    }

    function test_ownerBalanceEqualsInitialSupply() public {
        uint256 supply = 7e18;
        ArcToken tok = new ArcToken("T", "T", supply, owner);
        assertEq(tok.balanceOf(owner), supply);
    }

    function test_deployerBalanceIsZero() public {
        // msg.sender in this call is the test contract, not the owner
        ArcToken tok = new ArcToken("T", "T", 1e18, owner);
        assertEq(tok.balanceOf(address(this)), 0);
    }

    function test_zeroSupplyAllowed() public {
        ArcToken tok = new ArcToken("T", "T", 0, owner);
        assertEq(tok.totalSupply(), 0);
        assertEq(tok.balanceOf(owner), 0);
    }

    function test_ownerZeroReverts() public {
        vm.expectRevert(bytes("owner zero"));
        new ArcToken("T", "T", 1e18, address(0));
    }

    // --- No mint function --------------------------------------------------

    function test_noMintFunction() public {
        ArcToken tok = new ArcToken("T", "T", 1e18, owner);
        bytes4 sel = bytes4(keccak256("mint(address,uint256)"));
        (bool ok,) = address(tok).call(abi.encodeWithSelector(sel, owner, 1e18));
        assertFalse(ok, "mint should not exist");
    }

    // --- Transfer / approve ------------------------------------------------

    function test_transferWorks() public {
        uint256 supply = 100e18;
        ArcToken tok = new ArcToken("T", "T", supply, owner);
        address recipient = makeAddr("recipient");
        vm.prank(owner);
        tok.transfer(recipient, 10e18);
        assertEq(tok.balanceOf(recipient), 10e18);
        assertEq(tok.balanceOf(owner), supply - 10e18);
    }

    function test_approveAndTransferFromWork() public {
        uint256 supply = 100e18;
        ArcToken tok = new ArcToken("T", "T", supply, owner);
        address spender = makeAddr("spender");
        address recipient = makeAddr("recipient");
        vm.prank(owner);
        tok.approve(spender, 50e18);
        assertEq(tok.allowance(owner, spender), 50e18);
        vm.prank(spender);
        tok.transferFrom(owner, recipient, 30e18);
        assertEq(tok.balanceOf(recipient), 30e18);
        assertEq(tok.allowance(owner, spender), 20e18);
    }

    // --- CREATE2 collision reverts ----------------------------------------

    function test_create2CollisionReverts() public {
        bytes32 salt = keccak256("collision-test");
        bytes memory init = abi.encodePacked(
            type(ArcToken).creationCode,
            abi.encode("T", "T", uint256(1e18), owner)
        );
        factory.deploy(salt, init);
        vm.expectRevert(bytes("create2 failed"));
        factory.deploy(salt, init);
    }

    // --- Fuzz ---------------------------------------------------------------

    function testFuzz_balancesMatch(uint256 supply, address fuzzOwner) public {
        supply = bound(supply, 0, type(uint128).max);
        vm.assume(fuzzOwner != address(0));
        ArcToken tok = new ArcToken("T", "T", supply, fuzzOwner);
        assertEq(tok.balanceOf(fuzzOwner), supply);
        assertEq(tok.totalSupply(), supply);
    }
}

// ===========================================================================
// ArcNFT tests
// ===========================================================================
contract ArcNFTTest is Test {
    MiniFactory factory;
    address owner = makeAddr("owner");

    function setUp() public {
        factory = new MiniFactory();
    }

    // --- CREATE2 address prediction and ownership --------------------------

    function test_create2_addressPrediction() public {
        bytes32 salt = keccak256("arc-nft-v1");
        bytes memory init = abi.encodePacked(
            type(ArcNFT).creationCode,
            abi.encode("ArcNFT", "ANFT", "ipfs://abc/", uint256(5), owner)
        );
        address predicted = predictCreate2(address(factory), salt, init);
        address deployed  = factory.deploy(salt, init);
        assertEq(deployed, predicted);
    }

    function test_create2_factoryHoldsNothing() public {
        bytes32 salt = keccak256("arc-nft-v2");
        uint256 qty = 10;
        bytes memory init = abi.encodePacked(
            type(ArcNFT).creationCode,
            abi.encode("ArcNFT", "ANFT", "", qty, owner)
        );
        address deployed = factory.deploy(salt, init);
        ArcNFT nft = ArcNFT(deployed);
        assertEq(nft.balanceOf(address(factory)), 0, "factory must hold 0");
        assertEq(nft.balanceOf(owner), qty,           "owner must hold all");
    }

    // --- Quantity bounds ---------------------------------------------------

    function test_quantity1Works() public {
        ArcNFT nft = new ArcNFT("N", "N", "", 1, owner);
        assertEq(nft.balanceOf(owner), 1);
        assertEq(nft.ownerOf(1), owner);
    }

    function test_quantity50Works() public {
        ArcNFT nft = new ArcNFT("N", "N", "", 50, owner);
        assertEq(nft.balanceOf(owner), 50);
        for (uint256 i = 1; i <= 50; i++) {
            assertEq(nft.ownerOf(i), owner);
        }
    }

    function test_quantity0Reverts() public {
        vm.expectRevert(bytes("quantity 1-50"));
        new ArcNFT("N", "N", "", 0, owner);
    }

    function test_quantity51Reverts() public {
        vm.expectRevert(bytes("quantity 1-50"));
        new ArcNFT("N", "N", "", 51, owner);
    }

    function test_ownerZeroReverts() public {
        vm.expectRevert(bytes("owner zero"));
        new ArcNFT("N", "N", "", 1, address(0));
    }

    // --- Ownership of ids --------------------------------------------------

    function test_allIdsOwnedByOwner() public {
        uint256 qty = 7;
        ArcNFT nft = new ArcNFT("N", "N", "", qty, owner);
        for (uint256 i = 1; i <= qty; i++) {
            assertEq(nft.ownerOf(i), owner);
        }
        assertEq(nft.balanceOf(owner), qty);
    }

    function test_id0DoesNotExist() public {
        ArcNFT nft = new ArcNFT("N", "N", "", 3, owner);
        vm.expectRevert();
        nft.ownerOf(0);
    }

    function test_quantityPlusOneDoesNotExist() public {
        uint256 qty = 3;
        ArcNFT nft = new ArcNFT("N", "N", "", qty, owner);
        vm.expectRevert();
        nft.ownerOf(qty + 1);
    }

    // --- tokenURI ----------------------------------------------------------

    function test_tokenURIWithBase() public {
        ArcNFT nft = new ArcNFT("N", "N", "ipfs://abc/", 10, owner);
        assertEq(nft.tokenURI(7), "ipfs://abc/7");
        assertEq(nft.tokenURI(1), "ipfs://abc/1");
        assertEq(nft.tokenURI(10), "ipfs://abc/10");
    }

    function test_tokenURIEmptyBase() public {
        ArcNFT nft = new ArcNFT("N", "N", "", 5, owner);
        // OZ ERC721 v5: tokenURI returns "" when _baseURI() is "" (no id appended)
        string memory uri = nft.tokenURI(3);
        assertEq(uri, "");
    }

    // --- name / symbol -----------------------------------------------------

    function test_nameSymbol() public {
        ArcNFT nft = new ArcNFT("My NFT", "MFT", "", 1, owner);
        assertEq(nft.name(), "My NFT");
        assertEq(nft.symbol(), "MFT");
    }

    // --- Transfer ----------------------------------------------------------

    function test_ownerCanTransfer() public {
        ArcNFT nft = new ArcNFT("N", "N", "", 3, owner);
        address recipient = makeAddr("recipient");
        vm.prank(owner);
        nft.transferFrom(owner, recipient, 2);
        assertEq(nft.ownerOf(2), recipient);
        assertEq(nft.balanceOf(owner), 2);
        assertEq(nft.balanceOf(recipient), 1);
    }

    // --- supportsInterface -------------------------------------------------

    function test_supportsERC721Interface() public {
        ArcNFT nft = new ArcNFT("N", "N", "", 1, owner);
        assertTrue(nft.supportsInterface(0x80ac58cd), "ERC721 interface");
    }

    // --- Fuzz --------------------------------------------------------------

    function testFuzz_quantityInRange(uint256 qty) public {
        qty = bound(qty, 1, 50);
        ArcNFT nft = new ArcNFT("N", "N", "", qty, owner);
        assertEq(nft.balanceOf(owner), qty);
        for (uint256 i = 1; i <= qty; i++) {
            assertEq(nft.ownerOf(i), owner);
        }
    }
}

// ===========================================================================
// ArcMultiToken tests
// ===========================================================================
contract ArcMultiTokenTest is Test {
    MiniFactory factory;
    address owner = makeAddr("owner");

    function setUp() public {
        factory = new MiniFactory();
    }

    // --- CREATE2 address prediction and ownership --------------------------

    function test_create2_addressPrediction() public {
        bytes32 salt = keccak256("arc-multi-v1");
        bytes memory init = abi.encodePacked(
            type(ArcMultiToken).creationCode,
            abi.encode("ipfs://multi/", uint256(1), uint256(100), owner)
        );
        address predicted = predictCreate2(address(factory), salt, init);
        address deployed  = factory.deploy(salt, init);
        assertEq(deployed, predicted);
    }

    function test_create2_factoryHoldsNothing() public {
        bytes32 salt = keccak256("arc-multi-v2");
        uint256 tid = 1;
        uint256 amt = 100;
        bytes memory init = abi.encodePacked(
            type(ArcMultiToken).creationCode,
            abi.encode("ipfs://multi/", tid, amt, owner)
        );
        address deployed = factory.deploy(salt, init);
        ArcMultiToken mt = ArcMultiToken(deployed);
        assertEq(mt.balanceOf(address(factory), tid), 0, "factory must hold 0");
        assertEq(mt.balanceOf(owner, tid), amt,          "owner must hold amount");
    }

    // --- Basic balance properties -----------------------------------------

    function test_ownerBalanceEqualsAmount() public {
        uint256 tid = 42;
        uint256 amt = 999;
        ArcMultiToken mt = new ArcMultiToken("ipfs://x/", tid, amt, owner);
        assertEq(mt.balanceOf(owner, tid), amt);
    }

    function test_otherIdsAreZero() public {
        uint256 tid = 42;
        ArcMultiToken mt = new ArcMultiToken("ipfs://x/", tid, 10, owner);
        assertEq(mt.balanceOf(owner, tid + 1), 0);
        assertEq(mt.balanceOf(owner, tid - 1 > tid ? 0 : tid - 1), 0); // safe underflow guard
    }

    // --- Revert cases -------------------------------------------------------

    function test_amount0Reverts() public {
        vm.expectRevert(bytes("amount 0"));
        new ArcMultiToken("ipfs://x/", 1, 0, owner);
    }

    function test_ownerZeroReverts() public {
        vm.expectRevert(bytes("owner zero"));
        new ArcMultiToken("ipfs://x/", 1, 1, address(0));
    }

    // --- URI ----------------------------------------------------------------

    function test_uriReturnsConstructorString() public {
        string memory u = "ipfs://QmFoo/";
        ArcMultiToken mt = new ArcMultiToken(u, 1, 1, owner);
        // ERC1155 uri() ignores the id and returns the string as-is
        assertEq(mt.uri(1), u);
        assertEq(mt.uri(999), u);
    }

    function test_tokenId0Works() public {
        ArcMultiToken mt = new ArcMultiToken("ipfs://x/", 0, 5, owner);
        assertEq(mt.balanceOf(owner, 0), 5);
    }

    function test_tokenIdMaxWorks() public {
        uint256 tid = type(uint256).max;
        ArcMultiToken mt = new ArcMultiToken("ipfs://x/", tid, 3, owner);
        assertEq(mt.balanceOf(owner, tid), 3);
    }

    // --- safeTransferFrom --------------------------------------------------

    function test_ownerCanSafeTransferToEOA() public {
        uint256 tid = 7;
        uint256 amt = 50;
        ArcMultiToken mt = new ArcMultiToken("ipfs://x/", tid, amt, owner);
        address recipient = makeAddr("recipient");
        vm.prank(owner);
        mt.safeTransferFrom(owner, recipient, tid, 20, "");
        assertEq(mt.balanceOf(recipient, tid), 20);
        assertEq(mt.balanceOf(owner, tid), amt - 20);
    }

    // --- supportsInterface -------------------------------------------------

    function test_supportsERC1155Interface() public {
        ArcMultiToken mt = new ArcMultiToken("ipfs://x/", 1, 1, owner);
        assertTrue(mt.supportsInterface(0xd9b67a26), "ERC1155 interface");
    }

    // --- TransferSingle event at construction via factory ------------------
    // Verifies that operator == factory (not owner), because owner_ is explicit.
    // We use vm.recordLogs + manual inspection so we can check the emitter address
    // and all topics/data without relying on vm.expectEmit's address filter
    // (which requires the contract to be pre-deployed before the call).

    function test_constructionEmitsTransferSingleWithFactoryAsOperator() public {
        bytes32 salt = keccak256("arc-multi-event");
        uint256 tid = 5;
        uint256 amt = 77;
        bytes memory init = abi.encodePacked(
            type(ArcMultiToken).creationCode,
            abi.encode("ipfs://x/", tid, amt, owner)
        );

        // ERC1155 TransferSingle topic0
        bytes32 transferSingleTopic = keccak256("TransferSingle(address,address,address,uint256,uint256)");

        vm.recordLogs();
        address deployed = factory.deploy(salt, init);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // Find the TransferSingle log emitted by the deployed contract
        bool found = false;
        for (uint256 i = 0; i < logs.length; i++) {
            Vm.Log memory log = logs[i];
            if (log.topics.length < 4) continue;
            if (log.topics[0] != transferSingleTopic) continue;
            if (log.emitter != deployed) continue;

            // topics[1] = operator (indexed), topics[2] = from (indexed), topics[3] = to (indexed)
            address operator = address(uint160(uint256(log.topics[1])));
            address from     = address(uint160(uint256(log.topics[2])));
            address to       = address(uint160(uint256(log.topics[3])));
            (uint256 logId, uint256 logValue) = abi.decode(log.data, (uint256, uint256));

            assertEq(operator, address(factory), "operator must be factory");
            assertEq(from,     address(0),       "from must be zero");
            assertEq(to,       owner,            "to must be owner");
            assertEq(logId,    tid,              "id mismatch");
            assertEq(logValue, amt,              "value mismatch");
            found = true;
            break;
        }
        assertTrue(found, "TransferSingle not found in logs");
    }

    // --- Fuzz ---------------------------------------------------------------

    function testFuzz_balancesMatch(uint256 tid, uint256 amt, address fuzzOwner) public {
        vm.assume(fuzzOwner != address(0));
        // Exclude Foundry's VM cheatcode address to avoid "unknown cheatcode" errors
        vm.assume(fuzzOwner != address(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D));
        // ERC-1155 minting to an address with code calls onERC1155Received; contracts that do not
        // implement it (this test contract included) revert by design, so only fuzz plain accounts here.
        vm.assume(fuzzOwner.code.length == 0);
        amt = bound(amt, 1, type(uint128).max);
        ArcMultiToken mt = new ArcMultiToken("ipfs://x/", tid, amt, fuzzOwner);
        assertEq(mt.balanceOf(fuzzOwner, tid), amt);
    }
}
