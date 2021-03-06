/*
 * The MIT License (MIT)
 * Copyright (c) 2018 Heat Ledger Ltd.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * */

class TokenBalance {
  public isTokenBalance = true
  public balance: string
  public visible = false
  constructor(public name: string, public symbol: string, public address: string) {}
}

class CurrencyBalance {
  public isCurrencyBalance = true
  public balance: string
  public inUse = false
  public tokens: Array<TokenBalance> = []
  public visible = false
  constructor(public name: string, public symbol: string, public address: string, public secretPhrase: string) {}

  public unlock(noPathChange?: boolean) {
    let user = <UserService> heat.$inject.get('user')
    let $location = <angular.ILocationService> heat.$inject.get('$location')
    let lightwalletService = <LightwalletService> heat.$inject.get('lightwalletService')
    let bip44Compatible = lightwalletService.validSeed(this.secretPhrase)

    /* Create the ICurrency based on the currency type */
    let currency: ICurrency = null
    if (this.name=='Ethereum') {
      currency = new ETHCurrency(this.secretPhrase ,this.address)
    }
    else {
      currency = new HEATCurrency(this.secretPhrase, this.address)
    }

    user.unlock(this.secretPhrase,null,bip44Compatible, currency).then(
      () => {
        if (!noPathChange) {
          $location.path(currency.homePath)
          heat.fullApplicationScopeReload()
        }
      }
    )
  }
}

class CurrencyAddressLoading {
  public isCurrencyAddressLoading = true
  public visible = false
  public wallet: WalletType
  constructor(public name: string) {}
}

class CurrencyAddressCreate {
  public isCurrencyAddressCreate = true
  public visible = false
  public hidden = true
  public parent: WalletEntry
  public flatten: () => void
  constructor(public name: string, public wallet: WalletType) {}

  /* Handler for creating a new address, this method is declared here (on the node so to say)
    still after an architectural change where we dont display the CREATE node anymore.
    We'll be leaving it in place where all you need to do is set this.hidden=false to
    have it displayed again. */
  createAddress(component: WalletComponent) {

    // collect all CurrencyBalance of 'our' same currency type
    let currencyBalances = this.parent.currencies.filter(c => c['isCurrencyBalance'] && c.name == this.name)

    // if there is no address in use yet we use the first one
    if (currencyBalances.length == 0) {
      let nextAddress = this.wallet.addresses[0]
      let newCurrencyBalance = new CurrencyBalance('Ethereum','ETH',nextAddress.address, nextAddress.privateKey)
      component.rememberAdressCreated(this.parent.account, nextAddress.address)
      newCurrencyBalance.visible = this.parent.expanded
      this.parent.currencies.push(newCurrencyBalance)
      this.flatten()
      return true
    }

    // determine the first 'next' address based of the last currencyBalance displayed
    let lastAddress = currencyBalances[currencyBalances.length -1]['address']

    // when the last address is not yet used it should be used FIRST before we allow the creation of a new address
    if (!currencyBalances[currencyBalances.length -1]['inUse']) {
      return false
    }

    // look up the following address
    for (let i=0; i<this.wallet.addresses.length; i++) {

      // we've found the address
      if (this.wallet.addresses[i].address == lastAddress) {

        // next address is the one - but if no more addresses we exit since not possible
        if (i == this.wallet.addresses.length-1)
          return

        let nextAddress = this.wallet.addresses[i+1]
        let newCurrencyBalance = new CurrencyBalance('Ethereum','ETH',nextAddress.address, nextAddress.privateKey)
        component.rememberAdressCreated(this.parent.account, nextAddress.address)
        newCurrencyBalance.visible = this.parent.expanded
        let index = this.parent.currencies.indexOf(currencyBalances[currencyBalances.length-1])+1
        this.parent.currencies.splice(index, 0, newCurrencyBalance)
        this.flatten()
        return true
      }
    }

    return false
  }
}

class WalletEntry {
  public isWalletEntry=true
  public selected=true
  public identifier:string
  public secretPhrase:string
  public bip44Compatible: boolean
  public currencies: Array<CurrencyBalance|CurrencyAddressCreate|CurrencyAddressLoading> = []
  public pin:string
  public unlocked = false
  public visible = true
  public expanded = false
  constructor(public account: string, public name: string, public component: WalletComponent) {
    this.identifier = name ? `${name} | ${account}` : account
  }

  public toggle(forceVisible?: boolean) {
    this.expanded = forceVisible || !this.expanded
    this.currencies.forEach(curr => {
      let currency = <any>curr
      currency.visible = this.expanded
      if (currency.tokens) {
        currency.tokens.forEach(token => {
          token.visible = this.expanded
        })
      }
    })
    if (this.expanded) {
      this.component.loadEthereumAddresses(this)
    }
  }

  showSecretPhrase() {
    let panel:PanelService = heat.$inject.get('panel')
    panel.show(`
      <div layout="column" flex class="toolbar-copy-passphrase">
        <md-input-container flex>
          <textarea rows="2" flex ng-bind="vm.secretPhrase" readonly ng-trim="false"></textarea>
        </md-input-container>
      </div>
    `, {
      secretPhrase: this.secretPhrase
    })
  }

}

@RouteConfig('/wallet')
@Component({
  selector: 'wallet',
  template: `
   <!--  layout-align="start center" -->
    <div layout="column"  flex layout-padding>
      <div layout="row">

        <!-- Open File input is hidden -->
        <md-button class="md-primary md-raised">
          <md-tooltip md-direction="bottom">Open wallet file, adds all contents</md-tooltip>
          <label for="walet-input-file">
            Import File
          </label>
        </md-button>
        <input type="file" onchange="angular.element(this).scope().vm.pageAddFileInputChange(this.files)" class="ng-hide" id="walet-input-file">

        <!-- Adds a wallet seed (heat secret phrase or bip44 eth/btc seed) -->
        <md-button class="md-primary md-raised" ng-click="vm.importSeed()" aria-label="Import Seed">
          <md-tooltip md-direction="bottom">Import Seed</md-tooltip>
          Import Seed/Private Key
        </md-button>

        <!-- Export Wallet to File -->
        <md-button class="md-warn md-raised" ng-click="vm.exportWallet()" aria-label="Export Wallet" ng-if="!vm.allLocked">
          <md-tooltip md-direction="bottom">Export Wallet File</md-tooltip>
          Export Wallet File
        </md-button>

        <!-- Create ETH Account -->
        <md-button class="md-warn md-raised" ng-click="vm.createEthAccount($event)" aria-label="Create Account" ng-if="!vm.allLocked">
          <md-tooltip md-direction="bottom">Create Eth Address</md-tooltip>
          Create ETH Address
        </md-button>
      </div>

      <div layout="column" layout-fill  flex>
        <div layout-fill layout="column" class="wallet-entries" flex>

          <!-- Build a wallet structure that contains ::
                - wallet entries
                - per entry currency balances
                - per currency token balances  -->

          <md-list layout-fill layout="column" flex>
            <md-list-item ng-repeat="entry in vm.entries" ng-if="entry.visible && !entry.hidden">

              <!-- Wallet entry -->
              <div ng-if="entry.isWalletEntry" layout="row" class="wallet-entry" flex>
                <!--
                <md-checkbox ng-model="entry.selected">
                  <md-tooltip md-direction="bottom">
                    Check this to include in wallet export
                  </md-tooltip>
                </md-checkbox>
                -->
                <md-button class="md-icon-button left" ng-click="entry.toggle()">
                  <md-icon md-font-library="material-icons">{{entry.expanded?'expand_less':'expand_more'}}</md-icon>
                </md-button>

                <div flex ng-if="entry.secretPhrase" class="identifier"><a ng-click="entry.toggle()">{{entry.identifier}}</a></div>
                <div flex ng-if="!entry.secretPhrase" class="identifier">{{entry.identifier}}</div>
                <md-button ng-if="!entry.unlocked" ng-click="vm.unlock($event, entry)">Sign in</md-button>

                <md-menu md-position-mode="target-right target" md-offset="34px 34px" ng-if="entry.unlocked">
                  <md-button aria-label="user menu" class="md-icon-button right" ng-click="$mdOpenMenu($event)" md-menu-origin >
                    <md-icon md-font-library="material-icons">more_horiz</md-icon>
                  </md-button>
                  <md-menu-content width="4">
                    <md-menu-item>
                      <md-button aria-label="explorer" ng-click="entry.showSecretPhrase()">
                        <md-icon md-font-library="material-icons">file_copy</md-icon>
                        Show private key
                      </md-button>
                    </md-menu-item>
                    <md-menu-item>
                      <md-button aria-label="explorer" ng-click="vm.remove($event, entry)">
                        <md-icon md-font-library="material-icons">delete_forever</md-icon>
                        Remove
                      </md-button>
                    </md-menu-item>
                  </md-menu-content>
                </md-menu>
              </div>

              <!-- Currency Balance -->
              <div ng-if="entry.isCurrencyBalance" layout="row" class="currency-balance" flex>
                <div class="name">{{entry.name}}</div>&nbsp;
                <div class="identifier" flex><a ng-click="entry.unlock()">{{entry.address}}</a></div>&nbsp;
                <div class="balance">{{entry.balance}}&nbsp;{{entry.symbol}}</div>
              </div>

              <!-- Currency Address Loading -->
              <div ng-if="entry.isCurrencyAddressLoading" layout="row" class="currency-balance" flex>
                <div class="name">{{entry.name}}</div>&nbsp;
                <div class="identifier" flex>Loading ..</div>
              </div>

              <!-- Currency Address Create -->
              <div ng-if="entry.isCurrencyAddressCreate" layout="row" class="currency-balance" flex>
                <div class="name">{{entry.name}}</div>&nbsp;
                <div class="identifier" flex></div>
                <md-button ng-click="entry.createAddress()">Create New</md-button>
              </div>

              <!-- Token Balance -->
              <div ng-if="entry.isTokenBalance" layout="row" class="token-balance" flex>
                <div class="name">{{entry.name}}</div>&nbsp;
                <div class="identifier" flex>{{entry.address}}</div>&nbsp;
                <div class="balance">{{entry.balance}}&nbsp;{{entry.symbol}}</div>
              </div>

            </md-list-item>
          </md-list>
        </div>
      </div>
    </div>
  `
})
@Inject('$scope','$q','localKeyStore','walletFile','$window',
  'lightwalletService','heat','assetInfo','ethplorer',
  '$mdToast','$mdDialog','clipboard','user')
class WalletComponent {

  selectAll = true;
  allLocked = true

  entries:Array<WalletEntry|CurrencyBalance|TokenBalance> = []
  walletEntries: Array<WalletEntry> = []
  createdAddresses: {[key:string]:Array<string>} = {}

  constructor(private $scope: angular.IScope,
    private $q: angular.IQService,
    private localKeyStore: LocalKeyStoreService,
    private walletFile: WalletFileService,
    private $window: angular.IWindowService,
    private lightwalletService: LightwalletService,
    private heat: HeatService,
    private assetInfo: AssetInfoService,
    private ethplorer: EthplorerService,
    private $mdToast: angular.material.IToastService,
    private $mdDialog: angular.material.IDialogService,
    private clipboard: ClipboardService,
    private user: UserService) {

    this.initLocalKeyStore()
    this.initCreatedAddresses()
  }

  initLocalKeyStore() {
    this.entries = []
    this.walletEntries = []
    this.localKeyStore.list().map((account:string) => {
      let name = this.localKeyStore.keyName(account)
      let walletEntry = new WalletEntry(account, name, this)
      this.walletEntries.push(walletEntry)
    });
    this.walletEntries.forEach(walletEntry => {
      let password = this.localKeyStore.getPasswordForAccount(walletEntry.account)
      if (password) {
        try {
          var key = this.localKeyStore.load(walletEntry.account, password);
          if (key) {
            walletEntry.secretPhrase = key.secretPhrase
            walletEntry.bip44Compatible = this.lightwalletService.validSeed(key.secretPhrase)
            walletEntry.unlocked = true
            walletEntry.pin = password
            this.initWalletEntry(walletEntry)
          }
        } catch (e) { console.log(e) }
      }
    })
    this.flatten()
  }

  initCreatedAddresses() {
    for (let i=0; i<window.localStorage.length; i++) {
      let key = window.localStorage.key(i)
      let data = key.match(/eth-address-created:(.+):(.+)/)
      if (data) {
        let acc = data[1], addr = data[2]
        this.createdAddresses[acc] = this.createdAddresses[acc] || []
        this.createdAddresses[acc].push(addr)
      }
    }
  }

  rememberAdressCreated(account: string, ethAddress: string) {
    this.createdAddresses[account] = this.createdAddresses[account] || []
    this.createdAddresses[account].push(ethAddress)
    window.localStorage.setItem(`eth-address-created:${account}:${ethAddress}`,"1")
  }

  /* Iterates down all children of walletEntries and flattens them into the entries list */
  flatten() {
    this.$scope.$evalAsync(() => {
      this.entries = []
      this.walletEntries.forEach(walletEntry => {
        this.entries.push(walletEntry)
        walletEntry.currencies.forEach(curr => {
          let currencyBalance = <CurrencyBalance> curr
          this.entries.push(currencyBalance)
          if (currencyBalance.tokens) {
            currencyBalance.tokens.forEach(tokenBalance => {
              this.entries.push(tokenBalance)
            })
          }
        })
      })
    })
  }

  pageAddAddSecretPhrase($event) {
    this.promptSecretPlusPassword($event).then(
      data => {
        let account = heat.crypto.getAccountId(data.secretPhrase)
        let key = {
          account: account,
          secretPhrase: data.secretPhrase,
          pincode: data.password,
          name: ''
        };
        this.localKeyStore.add(key);
        this.$scope.$evalAsync(() => {
          this.initLocalKeyStore()
        })
      }
    )
  }

  pageAddFileInputChange(files) {
    if (files && files[0]) {
      let reader = new FileReader();
      reader.onload = () => {
        this.$scope.$evalAsync(() => {
          let fileContents = reader.result;
          let wallet = this.walletFile.createFromText(fileContents);
          if (wallet) {
            let addedKeys = this.localKeyStore.import(wallet);
            this.$scope.$evalAsync(() => {
              this.initLocalKeyStore();
            })
            let message = `Imported ${addedKeys.length} keys into this device`;
            this.$mdToast.show(this.$mdToast.simple().textContent(message).hideDelay(5000));
          }
        })
      };
      reader.readAsText(files[0]);
    }
  }

  remove($event, entry:WalletEntry) {
    dialogs.prompt($event, 'Remove Wallet Entry',
      `This completely removes the wallet entry from your device.
       Please enter your Password (or Pin Code) to confirm you wish to remove this entry`, '').then(
      pin => {
        if (pin == entry.pin) {
          this.localKeyStore.remove(entry.account)
          this.initLocalKeyStore()
        }
      }
    );
  }

  unlock($event, selectedWalletEntry: WalletEntry) {
    dialogs.prompt($event, 'Enter Password (or Pin)', 'Please enter your Password (or Pin Code) to unlock', '').then(
      pin => {
        let count = 0
        this.walletEntries.forEach(walletEntry => {
          if (!walletEntry.secretPhrase) {
            var key = this.localKeyStore.load(walletEntry.account, pin);
            if (key) {
              count += 1
              this.localKeyStore.rememberPassword(walletEntry.account, pin)
              walletEntry.pin = pin
              walletEntry.secretPhrase = key.secretPhrase
              walletEntry.bip44Compatible = this.lightwalletService.validSeed(key.secretPhrase)
              walletEntry.unlocked = true
              this.initWalletEntry(walletEntry)
            }
          }
        })
        let message = `Unlocked ${count?count:'NO'} entries`
        this.$mdToast.show(this.$mdToast.simple().textContent(message).hideDelay(5000));
        selectedWalletEntry.toggle(true)

        /* Only if no user is signed in currently, will we auto select one signin */
        if (!this.user.unlocked) {
          /* Try and unlock the selected entry */
          if (selectedWalletEntry.unlocked) {
            for (let i=0; i<selectedWalletEntry.currencies.length; i++) {
              let balance = <CurrencyBalance> selectedWalletEntry.currencies[i]
              if (balance.isCurrencyBalance) {
                balance.unlock(true)
                return
              }
            }
          }

          /* Try and find another CurrencyBalance */
          for (let i=0; i<this.entries.length; i++) {
            let balance = <CurrencyBalance> selectedWalletEntry.currencies[i]
            if (balance.isCurrencyBalance) {
              balance.unlock(true)
              return
            }
          }
        }
      }
    )
  }

  initWalletEntry(walletEntry: WalletEntry) {
    this.allLocked = false
    let heatAccount = heat.crypto.getAccountIdFromPublicKey(heat.crypto.secretPhraseToPublicKey(walletEntry.secretPhrase))
    let heatCurrencyBalance = new CurrencyBalance('HEAT', 'HEAT', heatAccount, walletEntry.secretPhrase)
    heatCurrencyBalance.visible = walletEntry.expanded
    walletEntry.currencies.push(heatCurrencyBalance)
    this.flatten()

    this.heat.api.getAccountByNumericId(heatAccount).then((account)=>{
      this.$scope.$evalAsync(()=> {
        let balanceUnconfirmed = utils.formatQNT(account.unconfirmedBalance, 8);
        heatCurrencyBalance.balance = balanceUnconfirmed
      })
      this.getAccountAssets(heatAccount).then((assetInfos) => {
        heatCurrencyBalance.tokens = []
        assetInfos.forEach(assetInfo => {
          let tokenBalance = new TokenBalance(assetInfo.name, assetInfo.symbol, assetInfo.id)
          tokenBalance.balance = utils.formatQNT(assetInfo.userBalance, 8)
          tokenBalance.visible = walletEntry.expanded
          heatCurrencyBalance.tokens.push(tokenBalance)
        })
        this.flatten()
      })
    }, () => {
      this.$scope.$evalAsync(()=> {
        heatCurrencyBalance.balance = "Address is unused"
        heatCurrencyBalance.symbol = ''
      })
    });

    /* Ethereum integration starts here */
    if (walletEntry.bip44Compatible || this.lightwalletService.validPrivateKey(walletEntry.secretPhrase)) {
      this.lightwalletService.unlock(walletEntry.secretPhrase, "").then(wallet => {

        let ethCurrencyAddressLoading = new CurrencyAddressLoading('Ethereum')
        ethCurrencyAddressLoading.visible = walletEntry.expanded
        ethCurrencyAddressLoading.wallet = wallet
        walletEntry.currencies.push(ethCurrencyAddressLoading)

        let ethCurrencyAddressCreate = new CurrencyAddressCreate('Ethereum', wallet)
        ethCurrencyAddressCreate.visible = walletEntry.expanded
        ethCurrencyAddressCreate.parent = walletEntry
        ethCurrencyAddressCreate.flatten = this.flatten.bind(this)
        walletEntry.currencies.push(ethCurrencyAddressCreate)

        this.flatten()

        /* Only if this node is expanded will we load the addresses */
        if (walletEntry.expanded) {
          this.loadEthereumAddresses(walletEntry)
        }
      })
    }
  }

  /* Only when we expand a wallet entry do we lookup its balances */
  public loadEthereumAddresses(walletEntry: WalletEntry) {

    /* Find the Loading node, if thats not available we can exit */
    let ethCurrencyAddressLoading = <CurrencyAddressLoading>walletEntry.currencies.find(c => (<CurrencyAddressLoading>c).isCurrencyAddressLoading)
    if (!ethCurrencyAddressLoading)
      return

    this.lightwalletService.refreshAdressBalances(ethCurrencyAddressLoading.wallet).then(() => {

      /* Make sure we exit if no loading node exists */
      if (!walletEntry.currencies.find(c => c['isCurrencyAddressLoading']))
        return

      let index = walletEntry.currencies.indexOf(ethCurrencyAddressLoading)
      ethCurrencyAddressLoading.wallet.addresses.forEach(address => {
        let wasCreated = (this.createdAddresses[walletEntry.account]||[]).indexOf(address.address) != -1
        if (address.inUse || wasCreated) {
          let ethCurrencyBalance = new CurrencyBalance('Ethereum','ETH',address.address, address.privateKey)
          ethCurrencyBalance.balance = Number(address.balance+"").toFixed(18)
          ethCurrencyBalance.visible = walletEntry.expanded
          ethCurrencyBalance.inUse = wasCreated ? false : true
          walletEntry.currencies.splice(index, 0, ethCurrencyBalance)
          index++;

          if (address.tokensBalances) {
            address.tokensBalances.forEach(balance => {
              let tokenBalance = new TokenBalance(balance.name, balance.symbol, balance.address)
              tokenBalance.balance = utils.commaFormat(balance.balance)
              tokenBalance.visible = walletEntry.expanded
              ethCurrencyBalance.tokens.push(tokenBalance)
            })
          }
        }
      })

      // we can remove the loading entry
      walletEntry.currencies = walletEntry.currencies.filter(c => c!=ethCurrencyAddressLoading)
      this.flatten()
    })
  }

  private getAccountAssets(account:string): angular.IPromise<Array<AssetInfo>> {
    let deferred = this.$q.defer<Array<AssetInfo>>();
    this.heat.api.getAccountBalances(account, "0", 1, 0, 100).then(balances => {
      let assetInfos: Array<AssetInfo> = [];
      let promises = [];
      balances.forEach(balance=>{
        if (balance.id != '0') {
          promises.push(
            this.assetInfo.getInfo(balance.id).then(info=>{
              assetInfos.push(angular.extend(info, {
                userBalance: balance.virtualBalance
              }))
            })
          );
        }
      });
      if (promises.length > 0) {
        this.$q.all(promises).then(()=>{
          assetInfos.sort((a,b)=>{
            var textA = a.symbol.toUpperCase();
            var textB = b.symbol.toUpperCase();
            return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
          });
          deferred.resolve(assetInfos);
        }, deferred.reject);
      }
      else {
        deferred.resolve([]);
      }
    }, deferred.reject);
    return <angular.IPromise<Array<AssetInfo>>> deferred.promise;
  }

  // @click
  importSeed($event) {
    this.promptSecretPlusPassword($event).then(
      data => {
        let account = heat.crypto.getAccountId(data.secretPhrase)
        let key = {
          account: account,
          secretPhrase: data.secretPhrase,
          pincode: data.password,
          name: ''
        };
        this.localKeyStore.add(key);
        let message = `Seed was successfully imported to your wallet`;
        this.$mdToast.show(this.$mdToast.simple().textContent(message).hideDelay(5000));
        heat.fullApplicationScopeReload()
      }
    )
  }

  // @click
  exportWallet() {
    let exported = this.localKeyStore.export();
    let encoded = this.walletFile.encode(exported);
    var blob = new Blob([encoded], {type: "text/plain;charset=utf-8"});
    saveAs(blob, 'heat.wallet');
  }

  promptSecretPlusPassword($event): angular.IPromise<{password:string, secretPhrase:string}> {
    let self = this
    function DialogController($scope: angular.IScope, $mdDialog: angular.material.IDialogService) {
      $scope['vm'].cancelButtonClick = function () {
        $mdDialog.cancel()
      }
      $scope['vm'].okButtonClick = function () {
        $mdDialog.hide({
          password: $scope['vm'].data.password1,
          secretPhrase: $scope['vm'].data.secretPhrase,
        })
      }
      $scope['vm'].secretChanged = function () {
        $scope['vm'].data.bip44Compatible = self.lightwalletService.validSeed($scope['vm'].data.secretPhrase)
      }
      $scope['vm'].data = {
        password1: '',
        password2: '',
        secretPhrase: '',
        bip44Compatible: false
      }
    }

    let deferred = this.$q.defer<{password:string, secretPhrase:string}>()
    this.$mdDialog.show({
      controller: DialogController,
      parent: angular.element(document.body),
      targetEvent: $event,
      clickOutsideToClose:false,
      controllerAs: 'vm',
      template: `
        <md-dialog>
          <form name="dialogForm">
            <md-toolbar>
              <div class="md-toolbar-tools"><h2>Import Seed/Private Key</h2></div>
            </md-toolbar>
            <md-dialog-content style="min-width:500px;max-width:600px" layout="column" layout-padding>
              <div flex layout="column">
                <p>Enter your Secret Seed and provide a Password (or Pin)</p>
                <md-input-container flex>
                  <label>HEAT Secret Phrase / Seed / Private Key</label>
                  <textarea rows="2" flex ng-model="vm.data.secretPhrase" name="secretPhrase" required ng-trim="false" ng-change="vm.secretChanged() "></textarea>
                </md-input-container>
                <md-input-container flex>
                  <label>Password</label>
                  <input ng-model="vm.data.password1" required name="password1">
                </md-input-container>
                <md-input-container flex>
                  <label>Password (confirm)</label>
                  <input ng-model="vm.data.password2" required name="password2">
                </md-input-container>
                <span>BIP44 compatible = <b>{{vm.data.bip44Compatible?'TRUE':'FALSE'}}</b></span>
              </div>
            </md-dialog-content>
            <md-dialog-actions layout="row">
              <span flex></span>
              <md-button class="md-warn" ng-click="vm.cancelButtonClick()" aria-label="Cancel">Cancel</md-button>
              <md-button ng-disabled="dialogForm.$invalid || vm.data.password1 != vm.data.password2" class="md-primary"
                  ng-click="vm.okButtonClick()" aria-label="OK">OK</md-button>
            </md-dialog-actions>
          </form>
        </md-dialog>
      `
    }).then(deferred.resolve, deferred.reject);
    return deferred.promise
  }

  createEthAccount($event) {
    let walletEntries = this.walletEntries
    let self = this
    if (walletEntries.length == 0)
      return

    function DialogController2($scope: angular.IScope, $mdDialog: angular.material.IDialogService) {
      $scope['vm'].copySeed = function () {
        self.clipboard.copyWithUI(document.getElementById('wallet-secret-textarea'), 'Copied seed to clipboard');
      }

      $scope['vm'].cancelButtonClick = function () {
        $mdDialog.cancel()
      }

      $scope['vm'].okButtonClick = function ($event) {
        let walletEntry = $scope['vm'].data.selectedWalletEntry
        let success = false
        if (walletEntry) {
          let node = walletEntry.currencies.find(c => c.isCurrencyAddressCreate && c.name == 'Ethereum')
          success = node.createAddress(self)
          walletEntry.toggle(true)
        }
        $mdDialog.hide(null).then(() => {
          if (!success) {
            dialogs.alert($event, 'Unable to Create Address', 'Make sure you use the previous address first before you can create a new address')
          }
        })
      }

      $scope['vm'].data = {
        selectedWalletEntry: walletEntries[0],
        selected: walletEntries[0].account,
        walletEntries: walletEntries,
        password: ''
      }

      $scope['vm'].selectedWalletEntryChanged = function () {
        $scope['vm'].data.password = ''
        $scope['vm'].data.selectedWalletEntry = walletEntries.find(w => $scope['vm'].data.selected==w.account)
      }

      $scope['vm'].passwordChanged = function () {
        let password = $scope['vm'].data.password
        let account = $scope['vm'].data.selected
        let walletEntry = walletEntries.find(w => w.account==account)
        try {
          var key = self.localKeyStore.load(account, password);
          if (key) {
            self.localKeyStore.rememberPassword(walletEntry.account, password)
            walletEntry.pin = password
            walletEntry.secretPhrase = key.secretPhrase
            walletEntry.bip44Compatible = self.lightwalletService.validSeed(key.secretPhrase)
            walletEntry.unlocked = true
            self.initWalletEntry(walletEntry)
            walletEntry.toggle(true)
          }
        } catch (e) {}
      }
    }

    let deferred = this.$q.defer<{password:string, secretPhrase:string}>()
    this.$mdDialog.show({
      controller: DialogController2,
      parent: angular.element(document.body),
      targetEvent: $event,
      clickOutsideToClose:false,
      controllerAs: 'vm',
      template: `
        <md-dialog>
          <form name="dialogForm">
            <md-toolbar>
              <div class="md-toolbar-tools"><h2>Create Ethereum Address</h2></div>
            </md-toolbar>
            <md-dialog-content style="min-width:500px;max-width:600px" layout="column" layout-padding>
              <div flex layout="column">
                <p>To create a new Ethereum address, please choose the master HEAT account you want to attach the new Ethereum address to:</p>

                <!-- Select Master Account -->

                <md-input-container flex>
                  <md-select ng-model="vm.data.selected" ng-change="vm.selectedWalletEntryChanged()">
                    <md-option ng-repeat="entry in vm.data.walletEntries" value="{{entry.account}}">{{entry.identifier}}</md-option>
                  </md-select>
                </md-input-container>

                <!-- Put In Password -->

                <div flex layout="column" ng-if="vm.data.selectedWalletEntry && !vm.data.selectedWalletEntry.unlocked">
                  <p>
                    Please first unlock this account by entering your password below
                  </p>
                  <md-input-container flex >
                    <label>Password</label>
                    <input ng-model="vm.data.password" ng-change="vm.passwordChanged()">
                  </md-input-container>
                </div>

                <!-- Invalid Non BIP44 Seed-->

                <p ng-if="vm.data.selectedWalletEntry && vm.data.selectedWalletEntry.unlocked && !vm.data.selectedWalletEntry.bip44Compatible">
                  Eth wallet cannot be added to that old HEAT account. Please choose another or create a new HEAT account with BIP44 compatible seed.
                </p>

                <!-- Valid BIP44 Seed -->
                <div flex layout="column"
                  ng-if="vm.data.selectedWalletEntry && vm.data.selectedWalletEntry.unlocked && vm.data.selectedWalletEntry.bip44Compatible">

                  <p>This is your Ethereum address seed, It’s the same as for your HEAT account {{vm.data.selectedWalletEntry.account}}.
                      Please store it in a safe place or you may lose access to your Ethereum.
                      <a ng-click="vm.copySeed()">Copy Seed</a></p>

                  <md-input-container flex>
                    <textarea rows="3" flex ng-model="vm.data.selectedWalletEntry.secretPhrase" readonly ng-trim="false"
                        style="font-family:monospace; font-size:16px; font-weight: bold; color: white; border: 1px solid white"></textarea>
                    <span id="wallet-secret-textarea" style="display:none">{{vm.data.selectedWalletEntry.secretPhrase}}</span>
                  </md-input-container>

                </div>
              </div>

            </md-dialog-content>
            <md-dialog-actions layout="row">
              <span flex></span>
              <md-button class="md-warn" ng-click="vm.cancelButtonClick($event)" aria-label="Cancel">Cancel</md-button>
              <md-button ng-disabled="!vm.data.selectedWalletEntry || !vm.data.selectedWalletEntry.unlocked || !vm.data.selectedWalletEntry.bip44Compatible"
                  class="md-primary" ng-click="vm.okButtonClick($event)" aria-label="OK">OK</md-button>
            </md-dialog-actions>
          </form>
        </md-dialog>
      `
    }).then(deferred.resolve, deferred.reject);
    return deferred.promise
  }

}
