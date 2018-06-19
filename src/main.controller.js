plugin.controller('wgnMultiConfigCtrl', ['$scope', '$q', '$routeParams', 'znData', 'znModal', 'znMessage', 'wgnMultiConfigSrv',
	function ($scope, $q, $routeParams, znData, znModal, znMessage, multiConfigService) {

		// No need to pollute the scope.
		var _workspaceId = $routeParams.workspace_id;
		var _forms = [];
		var _fields = {};
		var _folders = {};
		var _fieldsLoading = {};
		var _foldersLoading = {};
		var _originalConfig;

		/**
		 * Whether the plugin is loading or not, displays a throbber.
		 *
		 * @type {boolean}
		 */
		$scope.loading = true;

		/**
		 * Whether the plugin is saving or not, displays a throbber.
		 *
		 * @type {boolean}
		 */
		$scope.saving = false;

		/**
		 * The current config being created/edited, or false if none.
		 *
		 * @type {Object<Object|boolean>}
		 */
		$scope.editing = { config: false };

		/**
		 * The current display mode, one of 'grid' or 'list'.
		 *
		 * @type {string}
		 */
		$scope.display = 'grid';

		// Init plugin.
		init().then(function () {
			$scope.loading = false;
		});

		/**
		 * Creates a new configuration.
		 */
		$scope.onNewConfig = function () {
			var promise = $scope.editing.config ? $scope.onDiscardChanges() : $q.when();

			return promise.then(function () {
				$scope.editing.config = {
					enabled: false
				};

				doRunHook('add', $scope.editing.config).finally(function () {
					doResetTab();
					$scope.wgnConfigForm.$setPristine();
				});
			});
		};

		/**
		 * Edits an existing configuration.
		 *
		 * @param {string} id The config id.
		 */
		$scope.onEditConfig = function (id) {
			var promise = $scope.editing.config ? $scope.onDiscardChanges() : $q.when();

			return promise.then(function () {
				doResetTab();

				$scope.editing.config = $scope.configs.filter(function (config) {
					return config.$id === id;
				})[0];

				doRunHook('edit', $scope.editing.config).finally(function () {
					doResetTab();
					$scope.wgnConfigForm.$setPristine();
				});
			});
		};

		/**
		 * Deletes an existing configuration.
		 */
		$scope.onDeleteConfig = function () {
			znModal({
				title: 'Are you sure?',
				template: '<p>Are you sure you want to delete the <strong>' + $scope.editing.config.configName + '</strong> configuration?</p><p>This action is irreversible.</p>',
				classes: '',
				closeButton: false,
				btns: {
					'No': {
						primary: true,
						action: function () {
						}
					},
					'Yes': {
						danger: true,
						action: function () {
							return multiConfigService.deleteConfig(_workspaceId, $scope.editing.config, $scope.configs).then(function () {
								doRunHook('delete', $scope.editing.config).finally(function () {
									doDiscardChanges();
									znMessage('The configuration has been deleted!', 'info');
								});
							}).catch(function (err) {
								znMessage(err, 'error');
							});
						}
					}
				}
			});
		};

		/**
		 * Saves the current configuration.
		 */
		$scope.onSaveConfig = function () {
			$scope.saving = true;
			doProcessHighlighted();

			return doRunHook('preSave', $scope.editing.config).then(function (newCfg) {
				angular.extend($scope.editing.config, newCfg);
				return doSaveConfig($scope.editing.config);
			}).then(function () {
				doRunHook('postSave', $scope.editing.config).finally(function () {
					znMessage('Configuration saved!', 'saved');

					if ($scope.settings.multi) {
						doDiscardChanges();
					} else {
						doResetTab();
						$scope.wgnConfigForm.$setPristine();
					}

					$scope.saving = false;
				});
			});
		};

		/**
		 * Disables the current configuration.
		 */
		$scope.onDisableConfig = function () {
			$scope.editing.config.enabled = false;

			return doSaveConfig($scope.editing.config).then(function () {
				doRunHook('disable', $scope.editing.config).finally(function () {
					znMessage('Configuration disabled!', 'saved');
				});
			});
		};

		/**
		 * Enables the current configuration.
		 */
		$scope.onEnableConfig = function () {
			$scope.editing.config.enabled = true;

			return doSaveConfig($scope.editing.config).then(function () {
				doRunHook('enable', $scope.editing.config).finally(function () {
					znMessage('Configuration enabled!', 'saved');
				});
			});
		};

		/**
		 * Triggered by discarding configuration changes, prompts for confirmation.
		 *
		 * @return {Promise}
		 */
		$scope.onDiscardChanges = function () {
			var def = $q.defer();

			// Only prompt if form has been changed.
			if (!$scope.wgnConfigForm.$dirty) {
				doDiscardChanges();
				return $q.when(true);
			}

			znModal({
				title: 'Are you sure?',
				template: '<p>Are you sure you want to discard the current configuration changes?</p>',
				classes: '',
				closeButton: false,
				btns: {
					'No': {
						primary: true,
						action: function () {
							def.reject();
						}
					},
					'Yes': {
						danger: true,
						action: function () {
							doRunHook('discard', $scope.editing.config).finally(function () {
								doDiscardChanges();
								def.resolve();
							});
						}
					}
				}
			});

			return def.promise;
		};

		/**
		 * Switches to the given page (tab).
		 *
		 * @param {string} id
		 */
		$scope.onSelectPage = function (id) {
			$scope.view = id;
		};

		/**
		 * Loads fields for the selected form.
		 *
		 * @param {string} formField
		 * @param {Object} formDef
		 */
		$scope.onSelectForm = function (formField, formDef) {
			/*jshint maxcomplexity:6 */
			if (formField) {
				var formId = $scope.editing.config[formField];

				if (formId && (!(formId in _fields) || !_fields[formId].length)) {
					loadFields(formId, formDef);
				}

				if (formId && (!(formId in _folders) || !_folders[formId].length)) {
					loadFolders(formId);
				}
			}
		};

		/**
		 * Initializes a form field.
		 *
		 * @param {string} formField
		 * @param {Object} formDef
		 */
		$scope.initFormField = function (formField, formDef) {
			if ($scope.loading) {
				$scope.$on('wgnMultiConfigInit', function () {
					$scope.onSelectForm(formField, formDef);
				});
			} else {
				$scope.onSelectForm(formField, formDef);
			}
		};

		/**
		 * Loads all forms for a given input.
		 * If a type is passed, it hides forms set for other form inputs in the list.
		 *
		 * @param {string} [fieldId] Optional. The form input id.
		 *
		 * @return {Array<Object>}
		 */
		$scope.getForms = function (fieldId) {
			if (!fieldId || !$scope.editing.config || !$scope.editing.config[fieldId]) {
				return _forms;
			}

			var filterForms = [];

			angular.forEach($scope.settings.pages, function (page) {
				angular.forEach(page.fields, function (field) {
					if (field.type === 'form' && field.id !== fieldId) {
						if (field.id in $scope.editing.config && $scope.editing.config[field.id]) {
							filterForms.push($scope.editing.config[field.id]);
						}
					}
				});
			});

			// Filter values used in other inputs.
			return _forms.filter(function (f) {
				return filterForms.indexOf(f.id) === -1;
			});
		};

		/**
		 * Loads all fields for a given form.
		 *
		 * @param {Object} fieldDef The field input definition.
		 * @param {Object} formDef The form this input belongs to.
		 *
		 * @return {Array<Object>}
		 */
		$scope.getFields = function (fieldDef, formDef) {
			// Filter by restrict key if available.
			return getFiltered(fieldDef, formDef, _fields).filter(function (f) {
				if (!fieldDef.restrict) {
					return true;
				}

				var r = fieldDef.restrict.split('|');
				return r.indexOf(f.type) !== -1;
			});
		};

		/**
		 * Loads all folders for a given form.
		 *
		 * @param {Object} fieldDef The folder input definition.
		 * @param {Object} formDef The form this input belongs to.
		 *
		 * @return {Array<Object>}
		 */
		$scope.getFolders = function (fieldDef, formDef) {
			return getFiltered(fieldDef, formDef, _folders);
		};

		/**
		 * Loads all choices for a given field.
		 * This only really applies to checkbox, dropdown and radio fields.
		 *
		 * @param {Object} fieldDef The choice input definition.
		 *
		 * @return {Object}
		 */
		$scope.getChoices = function (fieldDef) {
			var fieldId = $scope.editing.config[fieldDef.id + '_source'];

			if (fieldId) {
				var formId = $scope.editing.config[fieldDef.belongsTo];

				if (formId && _fields[formId]) {
					var field = _fields[formId].filter(function (f) {
						return f.id === fieldId;
					})[0];

					if (field && 'choices' in field) {
						return field.choices;
					}
				}
			}
		};

		/**
		 * Returns whether a given form is loading its fields.
		 *
		 * @param {string} key A form config id.
		 *
		 * @return {boolean}
		 */
		$scope.isFieldLoading = function (key) {
			if ($scope.editing.config && key in $scope.editing.config) {
				return $scope.editing.config[key] in _fieldsLoading ? _fieldsLoading[$scope.editing.config[key]] : false;
			}
		};

		/**
		 * Returns whether a given form is loading its folders.
		 *
		 * @param {string} key A form config id.
		 *
		 * @return {boolean}
		 */
		$scope.isFolderLoading = function (key) {
			if ($scope.editing.config && key in $scope.editing.config) {
				return $scope.editing.config[key] in _foldersLoading ? _foldersLoading[$scope.editing.config[key]] : false;
			}
		};

		/**
		 * Saves after a configuration toggle.
		 *
		 * @param {Object} config
		 */
		$scope.onConfigToggle = function (config) {
			return doSaveConfig(config).then(function () {
				if (config.enabled) {
					doRunHook('enable', config).finally(function () {
						znMessage('Configuration ' + config.configName + ' enabled!', 'saved');
					});
				} else {
					doRunHook('disable', config).finally(function () {
						znMessage('Configuration ' + config.configName + ' disabled!', 'saved');
					});
				}
			});
		};

		/**
		 * Helper to return a list of filtered items from a given source.
		 * Used to return fields and folders for a given form.
		 *
		 * @param {Object} fieldDef The folder input definition.
		 * @param {Object|false} formDef The form this input belongs to in order to filter values used in other fields or false to return them all.
		 * @param {Object} source The source data.
		 *
		 * @return {Array<Object>}
		 */
		function getFiltered (fieldDef, formDef, source) {
			if (!fieldDef.belongsTo) {
				return [];
			}

			var filters = [];

			// Filter values used in other folder inputs.
			if (formDef) {
				angular.forEach(formDef.fields, function (f) {
					if (f.type === fieldDef.type && f.id !== fieldDef.id && $scope.editing.config) {
						if (f.type === 'choice' && f.id + '_source' in $scope.editing.config && $scope.editing.config[f.id + '_source']) {
							filters.push($scope.editing.config[f.id + '_source']);
						} else if (f.id in $scope.editing.config && $scope.editing.config[f.id]) {
							filters.push($scope.editing.config[f.id]);
						}
					}
				});
			}

			var formId = $scope.editing.config[fieldDef.belongsTo];

			return formId in source ? source[formId].filter(function (f) {
				return filters.indexOf(f.id) === -1;
			}) : [];
		}

		/**
		 * Centralize discarding config changes to avoid duplicating logic.
		 */
		function doDiscardChanges () {
			doResetTab();

			if ($scope.settings.multi) {
				$scope.editing.config = false;
			} else {
				$scope.editing.config = _originalConfig;
			}

			$scope.wgnConfigForm.$setPristine();
		}

		/**
		 * Switches to the first tab.
		 */
		function doResetTab () {
			if ($scope.settings.pages.length) {
				$scope.view = $scope.settings.pages[0].id;
			}
		}

		/**
		 * Loads field data for the given form.
		 *
		 * @param {number} formId The actual form id.
		 * @param {Object} formDef The page this form belongs to.
		 */
		function loadFields (formId, formDef) {
			_fieldsLoading[formId] = true;

			// Find all Zengine field types being used in our form.
			var fieldTypes = [];

			angular.forEach(formDef.fields, function (field) {
				if (field.restrict) {
					var res = field.restrict.split('|');

					angular.forEach(res, function (r) {
						if (fieldTypes.indexOf(r) === -1) {
							fieldTypes.push(r);
						}
					});
				}
			});

			return znData('FormFields').query({
				formId: formId,
				type: fieldTypes.join('|'),
				limit: 200
			}).then(function (results) {
				_fields[formId] = [];

				angular.forEach(results, function (field) {
					var f = {
						id: field.id,
						name: field.label,
						type: field.type
					};

					if ('settings' in field && 'properties' in field.settings && 'choices' in field.settings.properties) {
						f.choices = field.settings.properties.choices;
					}

					_fields[formId].push(f);
				});
			}).catch(function (err) {
				znMessage(err, 'error');
			}).finally(function () {
				_fieldsLoading[formId] = false;
			});
		}

		/**
		 * Loads folder data for the given form.
		 *
		 * @param {number} formId The actual form id.
		 */
		function loadFolders (formId) {
			_foldersLoading[formId] = true;

			return znData('FormFolders').get({
				formId: formId
			}).then(function (results) {
				_folders[formId] = [];

				angular.forEach(results, function (folder) {
					_folders[formId].push({
						id: folder.id,
						name: folder.name
					});
				});
			}).catch(function (err) {
				znMessage(err, 'error');
			}).finally(function () {
				_foldersLoading[formId] = false;
			});
		}

		/**
		 * Processes highlighted fields and adds additional keys to the config object.
		 */
		function doProcessHighlighted () {
			// Find highlighted fields.
			var highlighted = $scope.options.getHighlighted();
			var formatedHighligts = [];

			// Extract info from each one and save it for display.
			angular.forEach(highlighted, function (input) {
				/*jshint maxcomplexity:9 */
				var inputTypeFormatted = input.type.charAt(0).toUpperCase() + input.type.substr(1);

				switch (input.type) {
					case 'form':
						var form = $scope.getForms(input.id).filter(function (f) {
							return f.id === $scope.editing.config[input.id];
						})[0];

						if (form) {
							formatedHighligts.push({
								type: inputTypeFormatted,
								value: form.name
							});
						}
						break;

					case 'field':
					case 'choice':
						var fieldDef = $scope.options.getField(input.id);
						var field = $scope.getFields(fieldDef, false).filter(function (f) {
							var configKey = input.type === 'choice' ? input.id + '_source' : input.id;
							return f.id === $scope.editing.config[configKey];
						})[0];

						if (field) {
							formatedHighligts.push({
								type: inputTypeFormatted,
								value: field.name
							});
						}
						break;

					case 'folder':
						var folderDef = $scope.options.getField(input.id);
						var folder = $scope.getFolders(folderDef, false).filter(function (f) {
							return f.id === $scope.editing.config[input.id];
						})[0];

						if (folder) {
							formatedHighligts.push({
								type: inputTypeFormatted,
								value: folder.name
							});
						}
						break;

					default:
						// @TODO Reconsider whether we want to allow all inputs here.
						var val = $scope.editing.config[input.id].toString();
						if (val.length > 22) {
							val = val.substr(0, 22) + '...';
						}

						formatedHighligts.push({
							type: inputTypeFormatted,
							value: val
						});
				}
			});

			angular.forEach(formatedHighligts, function (h, i) {
				$scope.editing.config['mch' + (i + 1)] = h;
			});
		}

		/**
		 * Helper to actually save changes to firebase.
		 *
		 * @param {Object} A config object.
		 *
		 * @return {Promise}
		 */
		function doSaveConfig (config) {
			return $scope.settings.multi ?
				multiConfigService.save(_workspaceId, $scope.configs, config) :
				multiConfigService.saveSingle(_workspaceId, config);
		}

		/**
		 * Runs a Multi Config hook.
		 *
		 * @param {string} hook
		 * @param {Objecg} data
		 */
		function doRunHook (hook, data) {
			return $scope.options.run(hook, data);
		}

		/**
		 * Bootstraps plugin.
		 */
		function init () {
			$scope.settings = $scope.options.getConfig();
			doResetTab();

			// Load settings.
			return multiConfigService.load(_workspaceId, $scope.settings.multi).then(function (configs) {
				var def = $q.defer();

				$scope.configs = configs;

				if (!$scope.settings.multi) {
					$scope.editing.config = $scope.configs;
					_originalConfig = angular.copy($scope.configs);
				}

				doRunHook('init', $scope.configs).finally(function () {
					def.resolve();
				});

				return def.promise;
			}).then(function () {
				// Load available forms.
				return znData('Forms').get({ 'workspace.id': _workspaceId, 'limit': 200 });
			}).then(function (forms) {
				_forms = forms;
			});
		}
	}]);
