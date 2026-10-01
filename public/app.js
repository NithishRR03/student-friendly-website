function route() { 
  let v = location.hash.replace(/^#\//, '') || 'home'; 
  if (!['home', 'login', 'account', 'tools', 'builder'].includes(v)) v = 'home'; 
  
  if ((v === 'account' || v === 'tools' || v === 'builder') && !user) { 
    location.hash = '#/login'; 
    return; 
  } 
    
  if (user && !isProfileComplete(user) && v !== 'account') { 
    location.hash = '#/account'; 
    return; 
  } 
    
  $$('.view').forEach((e) => { e.hidden = e.id !== 'v-' + v; });
  updateNavigation();

  if (v === 'account') {
    fillAccount();
    if (user && !isProfileComplete(user)) {
      say($('#acctMsg'), '⚠ Mandatory: Please enter your Phone Number, Course, Job Field, and Location to unlock services.', false);
    }
  }
  
  if (v === 'tools') {
    loadChecklist();
    renderCourses(); 
  }
  
  if (v === 'builder') loadBuilder();
  scrollTo(0, 0);
}
