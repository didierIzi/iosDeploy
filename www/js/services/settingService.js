﻿app.service('settingService', ['$rootScope', '$q',
    function ($rootScope, $q) {

    	var cacheStepNames = undefined;
    	var cacheCurrency = undefined;
    	var cacheUseRoundPrices = undefined;
    	var cacheRoundPricesDigit = undefined;
    	var currencyLoaded = false;
    	var initialized = false;
    	var self = this;

        $rootScope.$on('pouchDBChanged', function (event, args) {
            if (args.status == "Change" &&  args.id.indexOf('Setting') == 0) {
                cacheStepNames = undefined;
                self.init();
            }
        });

        $rootScope.$on('dbDatasReplicate', function (event, args) {
            if (args.status == 'UpToDate') {
                self.init();
            }
        });

        this.init = function () {
            this.getRoundPriceSettingAsync();
            this.getRoundNumberPrecisionAsync();
        }

        //récupération de infos de gestion de l'arrondi
        this.getRoundPriceSettingAsync = function () {
            var self = this;
            var roundPricesDefer = $q.defer();

            if ($rootScope.modelDb.dataReady) {
                if (cacheUseRoundPrices) {
                    roundPricesDefer.resolve(cacheUseRoundPrices);
                } else {
                    $rootScope.dbInstance.rel.find('Setting').then(function (results) {
                        var roundPriceSetting = Enumerable.from(results.Settings).firstOrDefault("s => s.Name == 'shoppingcartsettings.roundpricesduringcalculation'");
                        if (roundPriceSetting) {
                            cacheUseRoundPrices = JSON.parse(roundPriceSetting.Value.toLowerCase());
                            roundPricesDefer.resolve(cacheUseRoundPrices);
                        } else {
                            roundPricesDefer.reject("Round price setting not found !");
                        }

                    }, function (err) {
                        roundPricesDefer.reject(err);
                    });
                }
            } else {
                roundPricesDefer.reject("Database isn't ready !");
            }

            return roundPricesDefer.promise;
        }

        this.getRoundPriceSetting = function() {
            return cacheUseRoundPrices;
        }

        //récupération de infos de gestion de l'arrondi
        this.getRoundNumberPrecisionAsync = function () {
            var self = this;
            var roundPricesDefer = $q.defer();

            if ($rootScope.modelDb.dataReady) {
                $rootScope.dbInstance.rel.find('Setting').then(function (results) {
                    var roundPriceSetting = Enumerable.from(results.Settings).firstOrDefault("s => s.Name == 'shoppingcartsettings.roundpricesdigits'");
                    if (roundPriceSetting) {
                        
                        
                        cacheRoundPricesDigit = parseInt(roundPriceSetting.Value);

                        //--> utils.js
                        ROUND_NB_DIGIT = cacheRoundPricesDigit;

                        roundPricesDefer.resolve(cacheRoundPricesDigit);
                    } else {
                        roundPricesDefer.reject("Round price setting not found !");
                    }

                }, function (err) {
                    roundPricesDefer.reject(err);
                });
            } else {
                roundPricesDefer.reject("Database isn't ready !");
            }

            return roundPricesDefer.promise;
        }

        this.getRoundNumberPrecision = function () {
            return cacheRoundPricesDigit;
        }

        //récupération des modes de paiement
        this.getPaymentModesAsync = function () {
            var self = this;
            var paymentDefer = $q.defer();

            if ($rootScope.modelDb.dataReady) {
                $rootScope.dbInstance.rel.find('Setting').then(function (results) {
                    var paymentSetting = Enumerable.from(results.Settings).firstOrDefault("s => s.Name == 'willbecardpaymentsettings.paiementoptionlist'");
                    if (paymentSetting) {
                        paymentSetting.ValueObject = JSON.parse(paymentSetting.Value);
                        paymentDefer.resolve(paymentSetting);
                    } else {
                        paymentDefer.reject("Setting not found !");
                    }
                    

                }, function (err) {
                    paymentDefer.reject(err);
                });
            } else {
                paymentDefer.reject("Database isn't ready !");
            }

            return paymentDefer.promise;
        }


        //Récupération des steps
        this.getStepNamesAsync = function () {
        	var self = this;
        	var valuesDefer = $q.defer();

        	if ($rootScope.modelDb.dataReady) {
        		if (cacheStepNames) {
        			valuesDefer.resolve(cacheStepNames);
        		} else {
        			$rootScope.dbInstance.get('Steps_1_0000000000000000').then(function (results) {
        				cacheStepNames = results.data;
        				valuesDefer.resolve(cacheStepNames);
        			}, function (err) {
        				valuesDefer.reject("Step names not found !");
        			});
        		}
        	} else {
        		valuesDefer.reject("Database isn't ready !");
        	}

        	return valuesDefer.promise;
        };

        //récupération des devises -- le canada n'est pas géré 
        this.getCurrencyAsync = function () {
        	var self = this;
        	var valuesDefer = $q.defer();

        	if ($rootScope.modelDb.dataReady) {
        		if (currencyLoaded) {
        			valuesDefer.resolve(cacheCurrency);
        		} else {
        			$rootScope.dbInstance.rel.find('Setting').then(function (results) {
        				var currencySetting = Enumerable.from(results.Settings).firstOrDefault(function (setting) {
        					return setting.Name.indexOf('currencysettings.primarystorecurrencyid') == 0 &&
								(($rootScope.IziBoxConfiguration.StoreId &&
                                  $rootScope.IziBoxConfiguration.StoreId == setting.StoreId) ||
								(!$rootScope.IziBoxConfiguration.StoreId &&
                                  $rootScope.IziBoxConfiguration.StoreId == 0))
        				});

        				currencyLoaded = true;

        				if (currencySetting) {
        					var currencyId = parseInt(currencySetting.Value);
        					$rootScope.dbInstance.rel.find('Currency', currencyId).then(function (resCurrency) {
        						cacheCurrency = Enumerable.from(resCurrency.Currencies).firstOrDefault();

        						if (cacheCurrency) {
        							//Obtain currency symbol
        							var number = 0;
        							var currencySymbol = number.toLocaleString('fr-FR', { style: 'currency', currency: cacheCurrency.CurrencyCode }).replace('0,00', '').trim()[0];
        							cacheCurrency.currencySymbol = currencySymbol;

                                    //TODO : implémenter le dollars canadien
        						}
        						
        						valuesDefer.resolve(cacheCurrency);
        					}, function (err) {
        						cacheCurrency = undefined;
        						valuesDefer.resolve(cacheCurrency);
        					});
        				} else {
        					cacheCurrency = undefined;
        					valuesDefer.resolve(cacheCurrency);
        				}

        			}, function (err) {
        				valuesDefer.reject(err);
        			});
        		}
        	} else {
        		valuesDefer.reject("Database isn't ready !");
        	}

        	return valuesDefer.promise;
        };

    }])