app.service('shoppingCartService', ["$http", "$rootScope", "$q", "zposService", "settingService",
    function ($http, $rootScope, $q, zposService, settingService) {
    	var current = this;

    	this.getLoyaltyObjectAsync = function (barcode) {
    		var loyaltyDefer = $q.defer();

    		//TODO
    		var getLoyaltyUrl = $rootScope.IziBoxConfiguration.UrlSmartStoreApi + "/RESTLoyalty/RESTLoyalty/GetLoyaltyObject?barcode=" + barcode;

    		//TODO for test
    		//var getLoyaltyUrl = "http://127.0.0.1/izipos/www/datas/loyaltytest.json";

    		var callLoyalty = function (retry) {
    			$http({
    				url: getLoyaltyUrl,
    				method: "GET",
    				timeout: 20000
    			}).
				then(function (response) {
					if (response && response.data && response.data.CustomerId != 0) {
						Enumerable.from(response.data.Offers).forEach(function (o) { o.OfferParam = JSON.parse(o.OfferParam); });
						loyaltyDefer.resolve(response.data);
					} else {
						loyaltyDefer.resolve();
					}
				}, function (err) {
					if (retry < 2) {
						callLoyalty(retry + 1);
					} else {
						loyaltyDefer.reject(err);
					}
				});
    		}

    		callLoyalty(0);

    		return loyaltyDefer.promise;
    	}

    	this.getFreezedShoppingCartsAsync = function () {
    		var shoppingCartsDefer = $q.defer();

    		$rootScope.dbFreeze.rel.find('ShoppingCart').then(function (resShoppingCarts) {
    			var shoppingCarts = resShoppingCarts.ShoppingCarts;

    			//Hack for remove duplicate
    			var shoppingCartsToRemove = [];
    			var shoppingCartsToReturn = [];

    			Enumerable.from(shoppingCarts).forEach(function (s) {
    				if (shoppingCartsToRemove.indexOf(s) == -1) {
    					var duplicateShoppingCarts = Enumerable.from(shoppingCarts).where(function (d) {
    						return d.Timestamp == s.Timestamp;
    					}).toArray();

    					if (duplicateShoppingCarts.length > 1) {
    						shoppingCartsToRemove.push.apply(shoppingCartsToRemove, duplicateShoppingCarts.slice(1));
    					}

    					shoppingCartsToReturn.push(duplicateShoppingCarts[0]);
    				}
    			});

    			Enumerable.from(shoppingCartsToRemove).forEach(function (r) {
    				current.unfreezeShoppingCartAsync(r);
    			});

    			shoppingCartsDefer.resolve(shoppingCartsToReturn);

    		}, function (err) {
    			shoppingCartsDefer.reject(err);
    		});

    		return shoppingCartsDefer.promise;
    	}

    	this.getFreezedShoppingCartByTableNumberAsync = function (tableNumber) {
    		var resultDefer = $q.defer();

    		$rootScope.showLoading();

    		if (tableNumber == undefined) {
    			$rootScope.hideLoading();
    			resultDefer.reject();
    		} else {
    			this.getFreezedShoppingCartsAsync().then(function (shoppingCarts) {
    				var result = Enumerable.from(shoppingCarts).firstOrDefault(function (sc) {
    					return sc.TableNumber == tableNumber;
    				});
    				if (result) {
    					$rootScope.hideLoading();
    					resultDefer.resolve(result);
    				} else {
    					$rootScope.hideLoading();
    					resultDefer.reject();
    				}
    			}, function (err) {
    				$rootScope.hideLoading();
    				resultDefer.reject();
    			});
    		}


    		return resultDefer.promise;
    	}

    	this.getFreezedShoppingCartByIdAsync = function (id) {
    		var resultDefer = $q.defer();

    		$rootScope.showLoading();

    		if (id == undefined) {
    			$rootScope.hideLoading();
    			resultDefer.reject();
    		} else {
    			$rootScope.dbFreeze.rel.find('ShoppingCart', id).then(function (resShoppingCarts) {
    				var result = Enumerable.from(resShoppingCarts.ShoppingCarts).firstOrDefault();
    				if (result) {
    					$rootScope.hideLoading();
    					resultDefer.resolve(result);
    				} else {
    					$rootScope.hideLoading();
    					resultDefer.reject();
    				}
    			}, function (err) {
    				$rootScope.hideLoading();
    				resultDefer.reject();
    			});
    		}


    		return resultDefer.promise;
    	}

    	this.freezeShoppingCartAsync = function (shoppingCart) {
    		var freezeDefer = $q.defer();

    		shoppingCart.rev = undefined;
    		shoppingCart.id = shoppingCart.Timestamp;

    		$rootScope.dbFreeze.rel.save('ShoppingCart', shoppingCart).then(function (result) {
    			freezeDefer.resolve(true);
    		}, function (errSave) {
    			freezeDefer.reject(errSave);
    		});

    		return freezeDefer.promise;
    	}

    	this.unfreezeShoppingCartAsync = function (shoppingCart,tryDel) {
    		var unfreezeDefer = $q.defer();

    		$rootScope.dbFreeze.rel.del('ShoppingCart', { id: shoppingCart.id, rev: shoppingCart.rev }).then(function (result) {
    			unfreezeDefer.resolve(true);
    		}, function (errDel) {
    			unfreezeDefer.reject(errDel);
    		});

    		return unfreezeDefer.promise;
    	}

    	this.saveShoppingCartAsync = function (shoppingCart) {
    		var saveDefer = $q.defer();

    		shoppingCart.rev = undefined;
    		shoppingCart.id = shoppingCart.Timestamp;

    		var innerSave = function (saveDefer, shoppingCart, retry) {
    			$rootScope.dbReplicate.rel.save('ShoppingCart', shoppingCart).then(function (result) {
    				try {
    					if (!shoppingCart.Canceled) {

    						$rootScope.dbZPos.rel.save('ShoppingCart', shoppingCart).then(function () { }, function () { });

    						var updatePayments = clone(shoppingCart.PaymentModes);

    						if (shoppingCart.Repaid && shoppingCart.Repaid > 0) {
    							var cashPayment = Enumerable.from(updatePayments).firstOrDefault(function (x) { return x.PaymentType == PaymentType.ESPECE });
    							if (cashPayment) {
    								cashPayment.Total = cashPayment.Total - shoppingCart.Repaid;
    							}
    						}

    						zposService.updatePaymentValuesAsync(updatePayments);
    					}
    				} catch (errPM) {

    				}

    				saveDefer.resolve(
                    {
                    	success: true,
                    	api: false
                    });
    			}, function (errSave) {
    				if (!retry) {
    					try {
    						$rootScope.dbReplicate.rel.find('ShoppingCart', shoppingCart.id).then(function (resShoppingCart) {
    							var existingSC = Enumerable.from(resShoppingCart.ShoppingCarts).firstOrDefault();
    							if (existingSC) {
    								shoppingCart.rev = existingSC.rev;
    								innerSave(saveDefer, shoppingCart, true);
    							} else {
    								saveDefer.reject();
    							}
    						}, function () {
    							saveDefer.reject();
    						});
    					} catch (errDel) {
    						saveDefer.reject(errDel);
    					}

    				} else {
    					saveDefer.reject(errSave);
    				}
    			});
    		}

    		innerSave(saveDefer, shoppingCart);

    		return saveDefer.promise;
    	}

    	this.savePaymentEditAsync = function (shoppingCart, paymentEdit, oldPaymentValues) {
    		var savePaymentDefer = $q.defer();

    		shoppingCart.id = shoppingCart.Timestamp;

    		$rootScope.dbZPos.rel.save('ShoppingCart', shoppingCart).then(function () {
    			$rootScope.dbReplicate.rel.save('PaymentEdit', paymentEdit).then(function () {
    				zposService.updatePaymentValuesAsync(paymentEdit.PaymentModes, oldPaymentValues).then(function () {
    					savePaymentDefer.resolve(paymentEdit);
    				}, function (errUpdP) {
    					savePaymentDefer.reject(errUpdP);
    				});
    			}, function (errSave) {
    				savePaymentDefer.reject(errSave);
    			});    			

    		}, function (err) {
    			savePaymentDefer.reject(err);
    		});



    		return savePaymentDefer.promise;
    	}

    	this.printShoppingCartAsync = function (shoppingCart, printerIdx, isPosTicket, printCount, ignorePrintTicket, nbNote) {
    		var printDefer = $q.defer();

    		if ($rootScope.IziBoxConfiguration.LoginRequired) {
    			shoppingCart.PosUserId = $rootScope.PosUserId;
    			shoppingCart.PosUserName = $rootScope.PosUserName;
    			shoppingCart.ShowNameOnTicket = $rootScope.PosUser.ShowNameOnTicket;
    		}


    		var shoppingCartPrinterReq = {
    			PrinterIdx: printerIdx,
    			ShoppingCart: shoppingCart,
    			IsPosTicket: isPosTicket,
    			PrintCount: printCount,
    			IgnorePrintTicket: ignorePrintTicket,
    			PrintQRCode: !isPosTicket && $rootScope.IziBoxConfiguration.PrintProdQRCode,
    			NbNote: nbNote
    		}

    		if ($rootScope.IziBoxConfiguration.LocalIpIziBox && printCount > 0) {
    			var printerApiUrl = "http://" + $rootScope.IziBoxConfiguration.LocalIpIziBox + ":" + $rootScope.IziBoxConfiguration.RestPort + "/print";
    			console.log("PrinterApiUrl : " + printerApiUrl);
    			this.printShoppingCartPOST(printerApiUrl, shoppingCartPrinterReq, printDefer);

    		} else {
    			setTimeout(function () {
    				printDefer.resolve(shoppingCartPrinterReq);
    			}, 100);
    		}

    		return printDefer.promise;
    	}

    	this.printProdAsync = function (shoppingCart, step) {
    	    var printDefer = $q.defer();

    	    if ($rootScope.IziBoxConfiguration.LoginRequired) {
    	        shoppingCart.PosUserId = $rootScope.PosUserId;
    	        shoppingCart.PosUserName = $rootScope.PosUserName;
    	        shoppingCart.ShowNameOnTicket = $rootScope.PosUser.ShowNameOnTicket;
    	    }


    	    var shoppingCartPrinterReq = {
    	    	ShoppingCart: shoppingCart,
				Step: step
    	    }

    	    if ($rootScope.IziBoxConfiguration.LocalIpIziBox) {
    	        var printerApiUrl = "http://" + $rootScope.IziBoxConfiguration.LocalIpIziBox + ":" + $rootScope.IziBoxConfiguration.RestPort + "/printprod";
    	        console.log("PrinterApiUrl : " + printerApiUrl);
    	        this.printShoppingCartPOST(printerApiUrl, shoppingCartPrinterReq, printDefer);

    	    } else {
    	        setTimeout(function () {
    	        	printDefer.resolve(shoppingCartPrinterReq);
    	        }, 100);
    	    }

    	    return printDefer.promise;
    	}

    	this.printShoppingCartPOST = function (printerApiUrl, shoppingCartPrinterReq, printDefer, retry) {
    		$http.post(printerApiUrl, shoppingCartPrinterReq, { timeout: 10000 }).
            success(function (data, status, headers, config) {
            	printDefer.resolve(shoppingCartPrinterReq);
            }).
            error(function (data, status, headers, config) {
            	if (!retry) retry = 1;
            	if (retry < 3) {
            		console.log("Retry print");
            		current.printShoppingCartPOST(printerApiUrl, shoppingCartPrinterReq, printDefer, retry + 1);
            	} else {
            		printDefer.reject("Print error");
            	}
            });
    	}

    	this.testPrinterAsync = function (idx) {
    		var printDefer = $q.defer();

    		var printerApiUrl = "http://" + $rootScope.IziBoxConfiguration.LocalIpIziBox + ":" + $rootScope.IziBoxConfiguration.RestPort + "/testprinter/" + idx;
    		console.log("PrinterApiUrl : " + printerApiUrl);

    		$http.get(printerApiUrl, { timeout: 10000 }).
            success(function (data, status, headers, config) {
            	printDefer.resolve(true);
            }).
            error(function (data, status, headers, config) {
            	printDefer.reject("Print error");
            });

    		return printDefer.promise;
    	}
    }
])