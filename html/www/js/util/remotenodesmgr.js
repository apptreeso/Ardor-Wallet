/******************************************************************************
 * Copyright © 2013-2016 The Nxt Core Developers.                             *
 * Copyright © 2016-2020 Jelurida IP B.V.                                     *
 *                                                                            *
 * See the LICENSE.txt file at the top-level directory of this distribution   *
 * for licensing information.                                                 *
 *                                                                            *
 * Unless otherwise agreed in a custom licensing agreement with Jelurida B.V.,*
 * no part of this software, including this file, may be copied, modified,    *
 * propagated, or distributed except according to the terms contained in the  *
 * LICENSE.txt file.                                                          *
 *                                                                            *
 * Removal or modification of this copyright notice is prohibited.            *
 *                                                                            *
 ******************************************************************************/

function RemoteNode(peerData, useAnnouncedAddress) {
    this.address = peerData.address;
    this.announcedAddress = peerData.announcedAddress;
    this.port = peerData.apiPort;
    this.isSsl = !!peerData.isSsl; // For now only nodes specified by the user can use SSL since we need trusted certificate
    this.useAnnouncedAddress = useAnnouncedAddress === true;
}

RemoteNode.prototype.getUrl = function () {
    return (this.isSsl ? "https://" : "http://") + (this.useAnnouncedAddress ? this.announcedAddress : this.address) + ":" + this.port;
};

function RemoteNodesManager(isTestnet) {
    this.isTestnet = isTestnet;
    this.nodes = {};
    this.blacklistTable = {}; //key is the address, value is the time until the address is blacklisted

    // Bootstrap connections
    this.bc = {
        success: 0, // Successful connections counter
        fail: 0, // Failed connections counter
        counter: 0, // Total connection attempts counter
        target: 0, // Target number of successful connections
        index: 0, // Next connection index
        bootstrapComplete: false //True when the bootstrap is complete and next callbacks should be ignored
    };
    this.init();
}

function isOldVersion(version) {
    let parts = String(version).split(".");
    if (parts.length == 3) {
        if (parseInt(parts[0], 10) < 1) {
            return true;
        }
        return parseInt(parts[1], 10) < 0;
    } else {
        return true;
    }
}

function isRemoteNodeConnectable(nodeData, isSslAllowed) {
    if (nodeData.services instanceof Array &&
        (nodeData.services.indexOf("API") >= 0 || (isSslAllowed && nodeData.services.indexOf("API_SSL") >= 0)
            || NRS.isDeviceForcedRemoteNode(nodeData.address, nodeData.announcedAddress))) {
        if (nodeData.services.indexOf("CORS") >= 0) {
            return !isOldVersion(nodeData.version);
        }
    }
    return false;
}

RemoteNodesManager.prototype.addRemoteNodes = function (peersData) {
    let mgr = this;
    $.each(peersData, function(index, peerData) {
        if (isRemoteNodeConnectable(peerData, false)) {
            mgr.nodes[peerData.address] = new RemoteNode(peerData);
            NRS.logConsole("Found remote node " + peerData.address + " blacklisted " + mgr.isBlacklisted(peerData.address));
        }
    });
};

RemoteNodesManager.prototype.blacklistAddress = function(address) {
    let blacklistedUntil = new Date().getTime() + 30 * 60 * 1000;
    NRS.logConsole("Blacklist " + address + " until " + new Date(blacklistedUntil).format("isoDateTime")
            + (this.isBlacklisted(address) ? " - period extended" : ""));
    this.blacklistTable[address] = blacklistedUntil;
};

RemoteNodesManager.prototype.isBlacklisted = function(address) {
    let blacklistedUntil = this.blacklistTable[address];
    return blacklistedUntil !== undefined && new Date().getTime() < blacklistedUntil;
};

RemoteNodesManager.prototype.getRandomNode = function (ignoredAddresses) {
    let addresses = Object.keys(this.nodes);
    if (addresses.length == 0) {
        NRS.logConsole("Cannot get random node. No nodes available");
        return null;
    }
    let index = Math.floor((Math.random() * addresses.length));
    let startIndex = index;
    let node;
    do {
        let address = addresses[index];
        if ((ignoredAddresses instanceof Array && ignoredAddresses.indexOf(address) >= 0)
                || this.isBlacklisted(address)) {
            node = null;
        } else {
            node = this.nodes[address];
        }
        index = (index+1) % addresses.length;
    } while(node == null && index != startIndex);

    return node;
};

RemoteNodesManager.prototype.getRandomNodes = function (count, ignoredAddresses) {
    let processedAddresses = [];
    if (ignoredAddresses instanceof Array) {
        processedAddresses.concat(ignoredAddresses)
    }

    let result = [];
    for (let i = 0; i < count; i++) {
        let node = this.getRandomNode(processedAddresses);
        if (node) {
            processedAddresses.push(node.address);
            result.push(node);
        }
    }
    return result;
};

RemoteNodesManager.prototype.findMoreNodes = function (isReschedule) {
    let nodesMgr = this;
    let node = this.getRandomNode();
    if (node == null) {
        return;
    }
    let data = {state: "CONNECTED", includePeerInfo: true};
    NRS.sendRequest("getPeers", data, function (response) {
        if (response.peers) {
            nodesMgr.addRemoteNodes(response.peers);
        }
        if (isReschedule) {
            setTimeout(function () {
                nodesMgr.findMoreNodes(true);
            }, 30000);
        }
    }, { noProxy: true, remoteNode: node });
};

RemoteNodesManager.prototype.init = function () {};
