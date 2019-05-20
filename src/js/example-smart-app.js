(function (window) {
  window.extractData = function () {
    var ret = $.Deferred();

    function onError() {
      console.log('Loading error', arguments);
      ret.reject();
    }

    function onReady(smart) {
      if (smart.hasOwnProperty('patient')) {
        var patient = smart.patient;
        var pt = patient.read();
        var obv = smart.patient.api.fetchAll({
          type: 'Observation',
          query: {
            code: {
              $or: ['http://loinc.org|8302-2', 'http://loinc.org|8462-4',
                'http://loinc.org|8480-6', 'http://loinc.org|2085-9',
                'http://loinc.org|2089-1', 'http://loinc.org|55284-4']
            }
          }
        });

        var condi = smart.patient.api.search({
          type: 'Condition'
        });

        var carep = smart.patient.api.search({
          type: 'CarePlan'
        });

        $.when(pt, obv, condi, carep).fail(onError);

        $.when(pt, obv, condi, carep).done(function (patient, obv, condi, carep) {
          var byCodes = smart.byCodes(obv, 'code');
          var gender = patient.gender;
          var mrn = getMRN(patient.identifier);

          var fname = '';
          var lname = '';

          if (typeof patient.name[0] !== 'undefined') {
            fname = patient.name[0].given.join(' ');
            lname = patient.name[0].family.join(' ');
          }

          var height = byCodes('8302-2');

          var conditionList = getConditions(condi);

          var careplanList = getCarePlan(carep);

          var p = defaultPatient();
          p.mrn = mrn;
          dob = new Date(patient.birthDate)
          p.birthdate = dob.toLocaleDateString() + " (" + getAge(dob) + " years old)";
          p.gender = gender.charAt(0).toUpperCase() + gender.slice(1);
          p.fname = fname + " " + lname;
          p.lname = lname;
          p.height = getQuantityValueAndUnit(height[0]);

          if (typeof conditionList != 'undefined') {
            p.condi = conditionList;
          }

          if (typeof careplanList != 'undefined') {
            p.carep = careplanList;
          }

          ret.resolve(p);
        });
      } else {
        onError();
      }
    }

    FHIR.oauth2.ready(onReady, onError);
    return ret.promise();

  };

  function defaultPatient() {
    return {
      mrn: { value: '' },
      fname: { value: '' },
      lname: { value: '' },
      gender: { value: '' },
      birthdate: { value: '' },
      height: { value: '' },
      condi: { value: '' },
      carep: { value: '' }
    };
  }

  function getAge(dateString) {
    var today = new Date();
    var birthDate = new Date(dateString);
    var age = today.getFullYear() - birthDate.getFullYear();
    // var m = today.getMonth() - birthDate.getMonth();
    // if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    //   age--;
    // }
    return age;
  }

  function getMRN(IDs) {
    for (var i = 0; i < IDs.length; i++) {
      if (IDs[i].type != undefined) {
        if (IDs[i].type.hasOwnProperty('coding')) {
          if (IDs[i].type.coding[0].code == 'MR') {
            return IDs[i].value;
          }
        }
      }
    }
    return -1;
  }

  function getConditions(Conditions) {
    var formattedConditions = [];
    // Conditions.data.entry[0].resource.clinicalStatus
    // Conditions.data.entry[0].resource.onsetDateTime
    // Conditions.data.entry[0].resource.verificationStatus
    // Conditions.data.entry[0].resource.code.coding[0].code
    // Conditions.data.entry[0].resource.code.coding[0].code
    //console.log(Conditions.data.entry[0].resource.code.coding[0].display);
    Conditions.data.entry.forEach(function (entries) {
      var clinicalStatus = entries.resource.clinicalStatus;
      var onsetDateTime = new Date(entries.resource.onsetDateTime);
      var verificationStatus = entries.resource.verificationStatus;
      var conditionDisplay = entries.resource.code.coding[0].display;

      if (conditionDisplay) {
        formattedConditions.push([conditionDisplay, onsetDateTime, clinicalStatus, verificationStatus]);
      }
    });

    formattedConditions.sort(function (a, b) {
      return b[1] - a[1]
    });

    return formattedConditions;
  }

  function getCarePlan(CarePlans) {
    var formattedCarePlans = [];
    // CarePlans.data.entry[0].resource.activity[0].detail.code.coding[0].display
    // CarePlans.data.entry[0].resource.category[0].coding[0].display
    // CarePlans.data.entry[0].resource.period.start
    // CarePlans.data.entry[0].resource.period.start
    // CarePlans.data.entry[0].resource.status
    // console.log(CarePlans.data.entry[0].resource);
    CarePlans.data.entry.forEach(function (entries) {
      var category = entries.resource.category[0].coding[0].display;
      var startPeriod = new Date(entries.resource.period.start);
      var status = entries.resource.status;

      var formattedActivities = [];
      entries.resource.activity.forEach(function (activities) {
        var activity = activities.detail.code.coding[0].display;

        if (activity) {
          formattedActivities.push(activity);
        }

      });

      if (category && status != 'completed') {
        formattedCarePlans.push([category, startPeriod, status, formattedActivities.join('|')]);
      }

    });

    formattedCarePlans.sort(function (a, b) {
      return b[1] - a[1]
    });

    return formattedCarePlans;
  }

  function getQuantityValueAndUnit(ob) {
    if (typeof ob != 'undefined' &&
      typeof ob.valueQuantity != 'undefined' &&
      typeof ob.valueQuantity.value != 'undefined' &&
      typeof ob.valueQuantity.unit != 'undefined') {
      return ob.valueQuantity.value + ' ' + ob.valueQuantity.unit;
    } else {
      return undefined;
    }
  }

  window.drawVisualization = function (p) {
    $('#holder').show();
    $('#loading').hide();
    $('#mrn').html(p.mrn);
    $('#fname').html(p.fname);
    $('#lname').html(p.lname);
    $('#gender').html(p.gender);
    $('#birthdate').html(p.birthdate);
    $('#height').html(p.height);
    $('#conditions').html(formatConditions(p.condi));
    $('#careplan').html(formatCarePlans(p.carep));
    $('#tools').html(decisionAids());
  };

})(window);

function formatConditions(Conditions) {
  var formatTable = '<table class="table">' + '<tr><th>Condition</th><th>Onset Date</th></tr>';
  for (var i = 0; i < Conditions.length; i++) {
    var Condition = Conditions[i];
    formatTable = formatTable + '<tr><td>' + Condition[0] + '</td><td>' + Condition[1].toLocaleDateString() + '</td></tr>';
  }
  formatTable = formatTable + '</table>';
  return formatTable;
}

function formatCarePlans(CarePlans) {
  var formatTable = '<table class="table">' + '<tr><th>Category</th><th>Period</th><th>Activity</th></tr>';
  for (var i = 0; i < CarePlans.length; i++) {
    var CarePlan = CarePlans[i];
    formatTable = formatTable + '<tr><td>' + CarePlan[0] + '</td><td>' + CarePlan[1].toLocaleDateString() + '</td><td>' + CarePlan[3].split('|').join(', ') + '</td></tr>';
  }
  formatTable = formatTable + '</table>';
  return formatTable;
}

function ICDVideo() {
  $('#tools').html(
  `
  <div style="padding:56.25% 0 0 0;position:relative;"><iframe src="https://player.vimeo.com/video/284768867" style="position:absolute;top:0;left:0;width:100%;height:100%;" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe></div><script src="https://player.vimeo.com/api/player.js"></script>
  <p><a href="https://vimeo.com/284768867">ICD V9</a> from <a href="https://vimeo.com/user83966291">Patient Decision Aids</a> on <a href="https://vimeo.com">Vimeo</a>.</p>
  <button type="button" class="btn btn-primary" onClick="ICDTool()">Done</button>
  `);
}

function ICDBooklet() {
  $('#tools').html(
  `
  <iframe src="http://docs.google.com/gview?url=https://patientdecisionaid.org/wp-content/uploads/2016/06/ICDInfographic-4.8.19.pdf&embedded=true" style="width:100%; height:700px;" frameborder="0"></iframe>
  <button type="button" class="btn btn-primary" onClick="ICDTool()">Done</button>
  `);
}

function ICDTool() {
  $('#tools').html(
  `<div class="page-header">
  <h1 style="color:blue"><small>A decision aid for</small><br>Implantable Cardioverter-Defibrillators (ICD)</h1>
  <h4>For patients with heart failure considering an ICD who are at risk for sudden cardiac death (primary prevention).</h4>
  </div>

  <div class="panel-group" id="accordion" role="tablist" aria-multiselectable="true">

  <div class="panel panel-default">
    <div class="panel-heading" role="tab" id="headingOne">
      <h4 class="panel-title">
        <a role="button" data-toggle="collapse" data-parent="#accordion" href="#collapseOne" aria-expanded="true" aria-controls="collapseOne">
        <strong>What is an ICD?</strong>
        </a>
      </h4>
    </div>
    <div id="collapseOne" class="panel-collapse collapse in" role="tabpanel" aria-labelledby="headingOne">
      <div class="panel-body">
      An ICD is a small device that is placed under the skin of the chest. Wires (called “leads”) connect the ICD to the heart. An ICD is designed to prevent an at-risk person from dying suddenly from a dangerous heart rhythm. When it senses a dangerous heart rhythm, an ICD gives the heart an electrical shock. It does this in order to get the heart to beat normally. An ICD is different than a pacemaker. A pacemaker helps the heart beat but does not give a shock like an ICD.
      <img src="https://patientdecisionaid.org/wordpress/wp-content/uploads/2016/10/ICD_breakout.png" class="img-responsive">
      </div>
    </div>
  </div>

  <div class="panel panel-default">
    <div class="panel-heading" role="tab" id="headingTwo">
      <h4 class="panel-title">
        <a class="collapsed" role="button" data-toggle="collapse" data-parent="#accordion" href="#collapseTwo" aria-expanded="false" aria-controls="collapseTwo">
        <strong>My doctor has asked me to consider an ICD. Why?</strong>
        </a>
      </h4>
    </div>
    <div id="collapseTwo" class="panel-collapse collapse" role="tabpanel" aria-labelledby="headingTwo">
      <div class="panel-body">
      <p>Due to your heart failure, you are at higher risk for developing a dangerous heart rhythm. A dangerous heart rhythm can cause you to die within minutes if not treated.</p>
      <p>Heart failure is when a heart is too weak to pump enough blood for the body. People with heart failure sometimes have breathing problems, leg swelling, and feel tired. Some people with heart failure may have no symptoms.</p>
      </div>
    </div>
  </div>

  <div class="panel panel-default">
    <div class="panel-heading" role="tab" id="headingThree">
      <h4 class="panel-title">
        <a class="collapsed" role="button" data-toggle="collapse" data-parent="#accordion" href="#collapseThree" aria-expanded="false" aria-controls="collapseThree">
        <strong>Consider two possible paths:</strong>
        </a>
      </h4>
    </div>
    <div id="collapseThree" class="panel-collapse collapse" role="tabpanel" aria-labelledby="headingThree">
      <div class="panel-body">
        <div class="row">
          <div class="col-sm-6">
            <div class="card">
            <h2 class="card-title text-center" >Path 1</h2>
            
              <img class="card-img-top" src="images/Path1.png" alt="Card image cap" class="img-responsive" width=100%>
              <div class="card-body">
              <p>You may choose to get an ICD. You may be feeling like you usually do, then a dangerous heart rhythm could happen. The ICD may help you live longer by treating a dangerous heart rhythm. You will continue to live with heart failure that may get worse over time.</p>
                <blockquote>\"I\'m not ready to die. I have so much I\'m trying to stay alive for. Even if it means getting shocked, I\'m willing to do anything that can help me live longer.\"</blockquote>
              </div>
            </div>
          </div>
          <div class="col-sm-6">
            <div class="card">
            <h2 class="card-title text-center">Path 2</h2>
            
              <img class="card-img-top" src="images/Path2.png" alt="Card image cap" class="img-responsive" width=100%>
              <div class="card-body">
              <p>You may choose to NOT get an ICD. You may be feeling like you usually do, and then a dangerous heart rhythm could happen. You may die quickly from the dangerous heart rhythm. This can happen at any time.</p>
              <blockquote>\"I\'ve lived a good life. The idea of dying quickly sounds like a painless way to go. I\'ve always said I hope to die in my sleep. Going through surgery and getting shocked is not the kind of thing I want.\"</blockquote>

              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="panel panel-default">
  <div class="panel-heading" role="tab" id="headingFour">
    <h4 class="panel-title">
      <a class="collapsed" role="button" data-toggle="collapse" data-parent="#accordion" href="#collapseFour" aria-expanded="false" aria-controls="collapseFour">
      <strong>What are the benefits of getting an ICD?</strong>
      </a>
    </h4>
  </div>
  <div id="collapseFour" class="panel-collapse collapse" role="tabpanel" aria-labelledby="headingFour">
    <div class="panel-body">
      <p>Thee numbers below are from recent medical studies. However, no one can know what will happen to any one person.</p>
      <img src="images/5yearstudy.png" class="img-responsive">
    </div>
  </div>
</div>

<div class="panel panel-default">
<div class="panel-heading" role="tab" id="headingFive">
  <h4 class="panel-title">
    <a class="collapsed" role="button" data-toggle="collapse" data-parent="#accordion" href="#collapseFive" aria-expanded="false" aria-controls="collapseFive">
    <strong>Can the ICD be turned off?</strong>
    </a>
  </h4>
</div>
<div id="collapseFive" class="panel-collapse collapse" role="tabpanel" aria-labelledby="headingFive">
  <div class="panel-body">
  Yes. It is possible to turn off the ICD without surgery. This is even recommended when a person is close to dying of another cause. It is possible to keep the pacemaker turned on. Talk about this with your doctor.
  </div>
</div>
</div>

<div class="panel panel-default">
<div class="panel-heading" role="tab" id="headingSix">
  <h4 class="panel-title">
    <a class="collapsed" role="button" data-toggle="collapse" data-parent="#accordion" href="#collapseSix" aria-expanded="false" aria-controls="collapseSix">
    <strong>Why would I want to turn off the ICD?</strong>
    </a>
  </h4>
</div>
<div id="collapseSix" class="panel-collapse collapse" role="tabpanel" aria-labelledby="headingSix">
  <div class="panel-body">
  In the future, people may reach a point where living as long as possible is not what they want anymore. This could be because of worsening heart failure or another illness. When this happens, the ICD can be turned off to avoid shocks.
  </div>
</div>
</div>

<div class="panel panel-default">
<div class="panel-heading" role="tab" id="headingSeven">
  <h4 class="panel-title">
    <a class="collapsed" role="button" data-toggle="collapse" data-parent="#accordion" href="#collapseSeven" aria-expanded="false" aria-controls="collapseSeven">
    <strong>What are the risks of getting an ICD?</strong>
    </a>
  </h4>
</div>
<div id="collapseSeven" class="panel-collapse collapse" role="tabpanel" aria-labelledby="headingSeven">
  <div class="panel-body">
  Problems do occur:
  <li>4 out of every 100 patients will experience some bleeding after surgery.</li>
  <li>2 out of every 100 patients will have a serious problem like damage to the lung or heart.</li>
  <li>About 1 out of every 100 patients will develop an infection.</li>
  <li>Some patients develop anxiety or depression from being shocked.</li>
  </div>
</div>
</div>

</div>

<button type="button" class="btn btn-primary" onClick="ICDBooklet()">Booklet</button>
<button type="button" class="btn btn-primary" onClick="ICDVideo()">Video</button>
  <button type="button" class="btn btn-primary" onClick="decisionAids()">Done</button>
  `);
}

function decisionAids() {
  $('#tools').html(
    `<div class="page-header">
    <h1>Patient Decision Aids</h1>
    <h4>Decision aids provide information about treatment options for patients to think about and to discuss with their health care providers.</h4>
    </div>

    <div class="container-fluid bg-3 text-center">
    <div class="row">
      <div class="col-sm-3">
        <div class="card" style="width: 18rem;">
          <img class="card-img-top" src="https://patientdecisionaid.org/wordpress/wp-content/uploads/2016/06/ICD_icon.png" alt="Card image cap">
          <div class="card-body">
            <h4 class="card-title">Implantable Cardioverter Defibrillator (ICD)</h4>
            <a href="#" class="btn btn-primary" id="ICDButton" onClick="ICDTool()">Let\'s Start</a>
          </div>
        </div>
      </div>
      <div class="col-sm-3">
        <div class="card" style="width: 18rem;">
          <img class="card-img-top" src="https://patientdecisionaid.org/wordpress/wp-content/uploads/2016/06/LVAD_icon.png" alt="Card image cap">
          <div class="card-body">
            <h4 class="card-title">Left Ventricular Assist Device (LVAD)</h4>

          </div>
        </div>
      </div>
      <div class="col-sm-3">
        <div class="card" style="width: 18rem;">
          <img class="card-img-top" src="https://patientdecisionaid.org/wp-content/uploads/2016/06/reimplant-new-color.png" alt="Card image cap">
          <div class="card-body">
            <h4 class="card-title">Cardiac Resynchronization Therapy with Defibrillation (CRT-D)</h4>

          </div>
        </div>
     </div>
      <div class="col-sm-3">
        <div class="card" style="width: 18rem;">
          <img class="card-img-top" src="https://patientdecisionaid.org/wp-content/uploads/2016/06/arni-teal.png" alt="Card image cap">
          <div class="card-body">
            <h4 class="card-title">Heart Failure Medications (ARNI)</h4>

          </div>
        </div>
      </div>
    </div>
    </div><br>

    <div class="container-fluid bg-3 text-center">
    <div class="row">
      <div class="col-sm-3">
        <div class="card" style="width: 18rem;">
          <img class="card-img-top" src="https://patientdecisionaid.org/wp-content/uploads/2016/06/Afib-logo.png" alt="Card image cap">
          <div class="card-body">
            <h4 class="card-title">Atrial Fibrillation: Stroke Prevention</h4>

          </div>
        </div>
      </div>
    </div>
    </div><br>
    `);
}