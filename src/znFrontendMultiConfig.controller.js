plugin.controller('wgnMultiConfigCtrl', ['$scope', '$q', '$routeParams', 'znModal', 'znMessage', 'wgnMultiConfigSrv',
	function ($scope, $q, $routeParams, znModal, znMessage, multiConfigService) {

		// Convenience.
		var workspaceId = $routeParams.workspace_id;

		/**
		 * Creates a new configuration.
		 */
		$scope.onNewConfig = function () {
			var promise = $scope.editingConfig ? $scope.onDiscardChanges() : $q.when();

			return promise.then(function () {
				doResetTab();
				$scope.editingConfig = {};
				$scope.$emit('wgnMultiConfigAdd');
			});
		};

		/**
		 * Edits an existing configuration.
		 *
		 * @param {string} id The config id.
		 */
		$scope.onEditConfig = function (id) {
			var promise = $scope.editingConfig ? $scope.onDiscardChanges() : $q.when();

			return promise.then(function () {
				doResetTab();
				$scope.editingConfig = angular.copy($scope.configs.filter(function (config) {
					return config.$id === id;
				})[0]);

				$scope.$emit('wgnMultiConfigEdit', $scope.editingConfig);
			});
		};

		/**
		 * Deletes an existing configuration.
		 */
		$scope.onDeleteConfig = function () {
			znModal({
				title: 'Are you sure?',
				template: '<p>Are you sure you want to delete the <strong>' + $scope.editingConfig.name + '</strong> configuration?</p><p>This action is irreversible.</p>',
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
							return multiConfigService.deleteConfig(workspaceId, $scope.editingConfig, $scope.configs).then(function () {
								$scope.$emit('wgnMultiConfigDelete', $scope.editingConfig);
								doDiscardChanges();
								znMessage('The configuration has been deleted!', 'info');
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
		 *
		 * @return {Promise}
		 */
		$scope.onSaveConfig = function () {
			return multiConfigService.save(workspaceId, $scope.configs, $scope.editingConfig).then(function () {
				$scope.$emit('wgnMultiConfigSave', $scope.editingConfig);
				doDiscardChanges();
				znMessage('Configuration saved!', 'saved');
			});
		};

		/**
		 * Triggered by discarding configuration changes, prompts for confirmation.
		 *
		 * @returns {Promise}
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
							doDiscardChanges();
							def.resolve();
						}
					}
				}
			});

			return def.promise;
		};

		/**
		 * Triggered by clicking a tab.
		 *
		 * @param {string} slug
		 */
		$scope.onSelectTab = function (slug) {
			$scope.view = slug;
		};

		/**
		 * Centralize discarding config changes to avoid duplicating logic.
		 */
		function doDiscardChanges () {
			$scope.editingConfig = false;
			$scope.wgnConfigForm.$setPristine();
			doResetTab();
			$scope.$emit('wgnMultiConfigDiscard');
		}

		function doResetTab () {
			if ($scope.tabs) {
				$scope.view = $scope.tabs[0].slug;
			}
		}
	}]);
