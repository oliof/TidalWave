var socket = null;
var connection = null;
var doc = null;
editor = null;
var parentList = null;
var userPermissionList = null;
var groupPermissionList = null;

// Helper function to resize the ace editor as the window size changes.
function resizeAce() {
  if($('#editor').is(":visible")) {
    $('#editor').height($(window).height() - 130);
    $('#content').height($(window).height() - 130);
    $('#content').css("overflow-y","scroll");
    editor.resize(true);
  } else {
    $('#content').css("height", "auto");
    $('#content').css("overflow-y","visible");
  }
};
//listen for changes to the window size and update the ace editor size.
$(window).resize(resizeAce);

var enableEditMode = function(pageStateService, $timeout) {
  console.log("Enabling edit mode");

  editor = ace.edit("editor");
  $timeout(function() {
    resizeAce();
  },1);
  editor.setReadOnly(true);
  editor.setValue("Loading...");
  editor.getSession().setUseWrapMode(true); // lines should wrap
  //editor.setTheme("ace/theme/monokai");
  editor.getSession().setMode("ace/mode/markdown");

  socket = new BCSocket(null, {reconnect: true});
  connection = new window.sharejs.Connection(socket);

  var pageDetails = pageStateService.get('pageDetails');
  console.log("SUBSCRIBING TO " + pageDetails.page._id);
  doc = connection.get('users', pageDetails.page._id);
  doc.subscribe();

  doc.whenReady(function () {
    console.log("SHAREJS IS READY");
    editor.setReadOnly(false);
    console.log(doc);
    if (!doc.type) doc.create('text');
    if (doc.type && doc.type.name === 'text') {
      doc.attachAce(editor, false, function(change) {
        $("#content-markdown").empty();
        var markdownText = marked(editor.getSession().getDocument().getValue());
        $("#content-markdown").append($.parseHTML(markdownText));
      });
      editor.focus();
    }
  });
};

app.controller('PageContentController', ['$scope', 'retryHttp', '$timeout', '$sce', '$anchorScroll', '$location', 'pageStateService', function($scope, retryHttp, $timeout, $sce, $anchorScroll, $location, pageStateService) {
  $scope.query = null;
  $scope.editMode = false;
  $scope.pageMode = null;

  // Set up FileDrop once the controller is created.
  $timeout(function() {
    setupFiledrop(retryHttp, pageStateService);
  });

  // When angular scrolls, ensure that the header does not block the
  // top content.
  $anchorScroll.yOffset = 100;

  if (getParameterByName('tour')) {
    $timeout(function(){
      createFirstViewTour();
    }, 100);
  }

  retryHttp.post(
    '/service/recentChangesVisible',
    null,
    function(data, status, headers, config) {
      // TODO: Implement this url
      $scope.recentChanges = [
      ];
    });

  // Start by fetching the current user
  retryHttp.post(
    '/service/me',
    null,
    function(data, status, headers, config) {
      if (data) {
        //TODO: Say success
        pageStateService.set('user',data);
      } else {
        console.log("NO USER FOUND.  ASSUMING ANONYMOUS");
      }

      // Then fetch the current page
      var pageName = $location.path();
      console.log("PAGE NAME: " + pageName);
      if (pageName && pageName.length>1) {
        changePage(retryHttp, $location, null, pageStateService, function() {
        });
      }
    });

  $scope.prettyDate = function(date) {
    var utcTime = new Date(date).getTime()/1000;
    return moment.unix(utcTime).format("dddd, MMMM Do YYYY, h:mm:ss a");
  };

  parentList = $('#select-parent').selectize({
    valueField: '_id',
    labelField: 'name',
    searchField: 'name',
    allowEmptyOption:true,
    create:false,
    persist: false,
    load: function(query, callback) {
      console.log("LOADING");
      if (!query.length) {
        callback();
        return;
      }
      $.ajax({
        url: '/service/pageStartsWith/' + encodeURIComponent(query),
        type: 'POST',
        error: function() {
          callback();
        },
        success: function(res) {
          for (var i=0;i<res.length;i++) {
            if (res[i]._id == pageStateService.get('pageDetails').page._id) {
              res.splice(i,1);
              break;
            }
          }
          callback(res);
        }
      });
    }
  })[0].selectize;

  userPermissionList = $('#userPermissionList').selectize({
    delimiter: ',',
    allowEmptyOption:true,
    create:false,
    valueField: '_id',
    labelField: 'fullName',
    searchField: 'fullName',
    load: function(query, callback) {
      console.log("LOADING");
      if (!query.length) {
        callback();
        return;
      }
      $.ajax({
        url: '/service/findUserFullName/' + encodeURIComponent(query),
        type: 'POST',
        error: function() {
          callback();
        },
        success: function(res) {
          console.log(res);
          callback(res);
        }
      });
    }
  })[0].selectize;

  groupPermissionList = $('#groupPermissionList').selectize({
    delimiter: ',',
    allowEmptyOption:true,
    create:false,
    valueField: '_id',
    labelField: 'name',
    searchField: 'name',
    load: function(query, callback) {
      console.log("LOADING");
      if (!query.length) {
        callback();
        return;
      }
      $.ajax({
        url: '/service/findGroupName/' + encodeURIComponent(query),
        type: 'POST',
        error: function() {
          callback();
        },
        success: function(res) {
          console.log(res);
          callback(res);
        }
      });
    }
  })[0].selectize;

  $scope.restorePageVersion = function(version) {
    var pageDetails = pageStateService.get('pageDetails');
    retryHttp.post(
      '/service/restorePageVersion',
      {
        _id:pageDetails.page._id,
        version:version
      },
      function(data, status, headers, config) {
        //TODO: Say success
      });
  };

  $scope.viewDiff = function(version) {
    var history = pageStateService.get('history');
    for (var i=0;i<history.length-1;i++) {
      var pageVersion = history[i];
      if (pageVersion.version == version) {
        var prevPageVersion = history[i+1];
        var dmp = new diff_match_patch();
        console.log(dmp);
        var diff = dmp.diff_main(prevPageVersion.content, pageVersion.content);
        dmp.diff_cleanupSemantic(diff);
        console.log(diff);
        var processedDiff = preprocessDiff(diff);
        console.log(processedDiff);
        pageStateService.set('diff',processedDiff);
      }
    }
  };

  $scope.updateSettings = function() {
    var pageDetails = pageStateService.get('pageDetails');
    var pageCopy = JSON.parse(JSON.stringify(pageDetails.page));

    console.log("NEW NAME: " + $scope.newName);
    var nameChanged = (pageCopy.name != $scope.newName);
    pageCopy.name = $scope.newName;

    var newParent = parentList.getValue();
    if (!newParent || newParent.length==0) {
      newParent = null;
    }
    console.log("NEW Parent: " + newParent);
    pageCopy.parentId = newParent;

    pageCopy.isPublic = $scope.isPublic;

    console.log(userPermissionList.getValue());
    console.log(groupPermissionList.getValue());

    console.log("PERMISSIONS");
    console.log(userPermissionList.getValue());
    if (userPermissionList.getValue().length>0) {
      pageCopy.userPermissions = userPermissionList.getValue().split(',');
    } else {
      pageCopy.userPermissions = [];
    }
    console.log(groupPermissionList.getValue());
    if (groupPermissionList.getValue().length>0) {
      pageCopy.groupPermissions = groupPermissionList.getValue().split(',');
    } else {
      pageCopy.groupPermissions = [];
    }

    console.log(pageCopy);
    retryHttp.post(
      '/service/updatePage',
      pageCopy,
      function(data, status, headers, config) {
        console.log("UPDATE PAGE RETURN VALUE");
        console.dir(data);
        if (data.page.fullyQualifiedName != pageDetails.page.fullyQualifiedName) {
          console.log("Name/parent changed, redirecting");
          changePage(retryHttp,$location,data.page.fullyQualifiedName,pageStateService,null);
        } else {
          // Update page details
          pageStateService.set('pageDetails',data);
          // Close the settings menu
          pageStateService.set('settingsActive',false);
        }
      });
  };

  $scope.changePage = function(newPageFQN) {
    changePage(retryHttp,$location,newPageFQN, pageStateService,null);
  };

  $scope.$on('pageStateServiceUpdate', function(event, response) {
    var key = response.key;
    var value = response.value;

    if (pageStateService.get('editMode') && pageStateService.get('searchContentResults')) {
      pageStateService.set('searchContentResults',null);
    }
    $scope.query = pageStateService.get('query');

    $scope.searchContentResults = pageStateService.get('searchContentResults');
    var pageDetails = pageStateService.get('pageDetails');
    var history = pageStateService.get('history');
    $scope.history = history;

    var diff = pageStateService.get('diff');
    if (diff) {
      $scope.diffSourceLines = [];
      $scope.diffDestLines = [];
      for (var a=0;a<diff[0].length;a++) {
        $scope.diffSourceLines.push({
          lineNumber:diff[0][a].lineNumber,
          style:diff[0][a].style,
          text:$sce.trustAsHtml(diff[0][a].text)});
      }
      for (var a=0;a<diff[1].length;a++) {
        $scope.diffDestLines.push({
          lineNumber:diff[1][a].lineNumber,
          style:diff[1][a].style,
          text:$sce.trustAsHtml(diff[1][a].text)});
      }
    } else {
      $scope.diffSourceLines = null;
      $scope.diffDestLines = null;
    }

    if($scope.searchContentResults) {
      $scope.pageMode = 'searchResults';
    } else if (!pageDetails) {
      $scope.pageMode = 'recentChanges';
    } else if($scope.diffSourceLines) {
      $scope.pageMode = 'diff';
    } else if(history) {
      $scope.pageMode = 'history';
    } else {
      $scope.pageMode = 'content';
    }
    if ($scope.pageMode != pageStateService.get('pageMode')) {
      pageStateService.set('pageMode',$scope.pageMode);
    }

    if (pageDetails) {
      $scope.page = pageDetails?pageDetails.page:null;
      $scope.newName = pageDetails.page.name;
      $scope.derivedUserPermissions = [];
      for (var a=0;a<pageDetails.derivedUserPermissions.length;a++) {
        $scope.derivedUserPermissions.push(pageDetails.derivedUserPermissions[a].fullName);
      }
      $scope.derivedGroupPermissions = [];
      for (var a=0;a<pageDetails.derivedGroupPermissions.length;a++) {
        $scope.derivedGroupPermissions.push(pageDetails.derivedGroupPermissions[a].name);
      }
      $scope.version = pageDetails?pageDetails.version:null;
      $scope.lastAncestorName = '';
      var ancestry = pageDetails.page.fullyQualifiedName.split('/');
      // Remove the page itself from the ancestry
      ancestry.pop();
      console.log("ANCESTRY");
      console.dir($scope.ancestry);
      console.dir(pageDetails.page.fullyQualifiedName.split('/'));

      $scope.ancestry = [];
      var fqn='';
      for (var i=0;i<ancestry.length;i++) {
        fqn = fqn + ancestry[i];
        $scope.ancestry.push({fqn:fqn,name:ancestry[i]});
        fqn = fqn + '/';
      }

      if ($scope.page) {
        $scope.isPublic = $scope.page.isPublic;
      }

      console.log(ancestry);
      if (ancestry && ancestry.length>0) {
        var parent = ancestry[ancestry.length-1];
        parentList.clearOptions();
        parentList.addOption({_id:parent._id, name:parent.name});
        parentList.setValue(parent._id);
      } else {
        parentList.clearOptions();
        parentList.setValue(null);
      }

      userPermissionList.clear();
      for (var i=0;i<pageDetails.userPermissions.length;i++) {
        var user = pageDetails.userPermissions[i];
        console.log("ADDING USER PERMISSION ");
        console.log(user);
        userPermissionList.addOption({_id:user._id, fullName:user.fullName});
        userPermissionList.addItem(user._id);
      }
      userPermissionList.refreshItems();

      groupPermissionList.clear();
      for (var i=0;i<pageDetails.groupPermissions.length;i++) {
        var group = pageDetails.groupPermissions[i];
        console.log("ADDING GROUP PERMISSION ");
        console.log(group);
        groupPermissionList.addOption({_id:group._id, name:group.name});
        groupPermissionList.addItem(group._id);
      }
      groupPermissionList.refreshItems();
    } else {
      if (pageStateService.get('editMode')) {
        pageStateService.set('editMode',false);
      }
    }

    if ($scope.editMode && !pageStateService.get('editMode')) {
      // Leave edit mode
      console.log("LEAVING EDIT MODE");
      retryHttp.post(
        '/service/savePageDynamicContent/'+$scope.page._id,
        null,
        function(data, status, headers, config) {
          console.log("SAVED PAGE");
          retryHttp.post(
            '/service/pageDetailsByFQN'+$location.path(),
            null,
            function(data, status, headers, config) {
              console.log("GOT PAGE DETAILS FROM HTTP");
              console.log(data);
              pageStateService.set('pageDetails',data);
              editor = null;
              $timeout(function() {
                resizeAce();
              },1);
              if (doc) {
                doc.destroy();
                connection.disconnect();
                doc = socket = connection = null;
              }
              pageStateService.set('settingsActive',false);
              $scope.editMode = pageStateService.get('editMode');
            });
        });
    }
    if (!$scope.editMode && pageStateService.get('editMode')) {
      // Enter edit mode
      $scope.editMode = pageStateService.get('editMode');
      console.log("ENTERING EDIT MODE");
      enableEditMode(pageStateService,$timeout);
    }

    $scope.settingsActive = pageStateService.get('settingsActive');
    if ((key == 'editMode' || key == 'pageDetails') && pageDetails && typeof pageDetails.page.content != undefined) {
      console.log("UPDATING MARKDOWN");
      console.log(pageDetails);
      console.log(key);
      if (pageDetails.viewable) {
        retryHttp.post(
          '/service/getTOC/'+pageDetails.page._id,
          null,
          function(data, status, headers, config) {
            $("#content-markdown").empty();
            var markdownText = null;
            if (data.length>0) {
              markdownText = marked("<div class=\"well well-lg\" style=\"display: inline-block;\"><h4>Table of Contents</h4>\n" + data.replace(/#/g,'#'+$location.path()+'#') + "\n</div><br />\n" + pageDetails.page.content);
            } else {
              markdownText = marked(pageDetails.page.content);
            }
            $("#content-markdown").append($.parseHTML(markdownText));
            $timeout(function(){
              $anchorScroll();
            }, 100);
          });
      } else {
        $("#content-markdown").empty();
        $("#content-markdown").append(marked("Sorry, you do not have access to this page."));
      }
    }
  });
}]);
