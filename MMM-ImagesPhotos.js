/* global Log MM Module */

/*
 * MagicMirror²
 * Module: MMM-ImagesPhotos
 *
 * By Rodrigo Ramírez Norambuena https://rodrigoramirez.com
 * MIT Licensed.
 */
const ourModuleName = "MMM-ImagesPhotos";

Module.register(ourModuleName, {
  defaults: {
    opacity: 0.9,
    animationSpeed: 500,
    updateInterval: 5000,
    getInterval: 60000,
    maxWidth: "100%",
    maxHeight: "100%",
    retryDelay: 2500,
    path: "",
    fill: false,
    blur: 8,
    sequential: false
  },

  wrapper: null,
  suspended: false,
  timer: null,
  fullscreen: false,

  requiresVersion: "2.24.0", // Required version of MagicMirror

  start() {
    this.photos = [];
    this.loaded = false;
    this.lastPhotoIndex = -1;
    this.config.id = this.identifier;
    this.sendSocketNotification("CONFIG", this.config);
  },
  getStyles() {
    return ["MMM-ImagesPhotos.css"];
  },

  /*
   * Requests new data from api url helper
   */
  async getPhotos() {
    const urlApHelper = `/MMM-ImagesPhotos/photos/${this.identifier}`;
    const self = this;
    let retry = true;

    try {
      const photosResponse = await fetch(urlApHelper);

      if (photosResponse.ok) {
        const photosData = await photosResponse.json();
        self.processPhotos(photosData);
      } else if (photosResponse.status === 401) {
        Log.error(self.name, photosResponse.status);
        retry = false;
      } else {
        Log.error(self.name, "Could not load photos.");
      }

      if (!photosResponse.ok) {
        if (retry) {
          self.scheduleUpdate(self.loaded ? -1 : self.config.retryDelay);
        }
      }
    } catch (error) {
      Log.error(self.name, error);
    }
  },
  notificationReceived(notification, payload, sender) {
    // Hook to turn off messages about notiofications, clock once a second
    if (notification === "ALL_MODULES_STARTED") {
      const ourInstances = MM.getModules().withClass(ourModuleName);
      ourInstances.forEach((m) => {
        if (m.data.position.toLowerCase().startsWith("fullscreen")) {
          this.fullscreen = true;
        }
      });
    }
  },
  startTimer() {
    const self = this;
    self.timer = setTimeout(() => {
      // Clear timer value for resume
      self.timer = null;
      if (self.suspended === false) {
        self.updateImage();
      }
    }, this.config.updateInterval);
  },

  updateImage() {
    // Get next image
    const photoImage = this.randomPhoto();
    if (!photoImage) return;

    if (this.fullscreen) {
      // Handle fullscreen mode update
      this.updateFullscreenImage(photoImage);
    } else {
      // Handle non-fullscreen mode update
      this.updateNonFullscreenImage(photoImage);
    }
  },

  updateNonFullscreenImage(photoImage) {
    // Find the existing div with the image
    const existingImageDiv = document.getElementById("mmm-images-photos");
    if (existingImageDiv && existingImageDiv.parentNode) {
      // Create a new temp image to preload
      const tempImage = new Image();
      tempImage.onload = () => {
        // Create a new div for the new image
        const newImageDiv = document.createElement("div");
        newImageDiv.id = "mmm-images-photos-new";
        newImageDiv.style.maxWidth = this.config.maxWidth;
        newImageDiv.style.maxHeight = this.config.maxHeight;
        newImageDiv.style.opacity = 0;  // Start invisible
        newImageDiv.className = "bgimage";
        newImageDiv.style.backgroundImage = `url(${photoImage.url})`;
        newImageDiv.style.transition = `opacity ${this.config.animationSpeed / 1000}s`;
        
        // Insert the new div before the existing one
        existingImageDiv.parentNode.insertBefore(newImageDiv, existingImageDiv);
        
        // First fade in new image completely
        setTimeout(() => {
          newImageDiv.style.opacity = this.config.opacity;
          
          // After new image is fully visible, then start fading out the old image
          setTimeout(() => {
            existingImageDiv.style.opacity = 0;
            
            // After fade out transition completes, then remove the old div and update ID
            setTimeout(() => {
              existingImageDiv.parentNode.removeChild(existingImageDiv);
              newImageDiv.id = "mmm-images-photos";
            }, this.config.animationSpeed);
          }, this.config.animationSpeed);
        }, 50);
      };
      
      // Handle image load error
      tempImage.onerror = () => {
        Log.error(`Image load failed: ${photoImage.url}`);
        // Try another image
        setTimeout(() => this.updateImage(), 1000);
      };
      
      // Start loading the image
      tempImage.src = photoImage.url;
    } else {
      // Fallback to updateDom if the element doesn't exist
      this.updateDom(this.config.animationSpeed);
    }
  },

  updateFullscreenImage(photoImage) {
    // Make sure the wrapper exists
    if (!this.fg) {
      this.updateDom(this.config.animationSpeed);
      return;
    }
    
    // Create a new image object to preload the image
    const tempImage = new Image();

    // Set error handler for the image load
    tempImage.onerror = () => {
      // Try another image
      setTimeout(() => this.updateImage(), 1000);
    };

    // Set onload handler for the image
    tempImage.onload = () => {
      const m = window
        .getComputedStyle(document.body, null)
        .getPropertyValue("margin-top");
        
      // Calculate dimensions
      const w = tempImage.width;
      const h = tempImage.height;
      const tw = document.body.clientWidth + parseInt(m, 10) * 2;
      const th = document.body.clientHeight + parseInt(m, 10) * 2;

      // Compute the new size and offsets
      const result = this.scaleImage(w, h, tw, th, true);

      // Create a div for displaying the image
      const imageDiv = document.createElement("div");
      imageDiv.style.position = "relative";
      imageDiv.style.left = `${result.targetleft}px`;
      imageDiv.style.top = `${result.targettop}px`;
      imageDiv.style.width = `${result.width}px`;
      imageDiv.style.height = `${result.height}px`;
      imageDiv.style.backgroundImage = `url(${photoImage.url})`;
      imageDiv.style.backgroundSize = 'cover';
      imageDiv.style.backgroundPosition = 'center';
      imageDiv.style.backgroundRepeat = 'no-repeat';
      
      // Initially invisible
      //c imageDiv.style.opacity = 0;
      //c imageDiv.style.transition = `opacity ${this.config.animationSpeed / 1000}s`;

      // Insert the new div at the beginning of the container (before old images)
      if (this.fg.firstChild) {
        this.fg.insertBefore(imageDiv, this.fg.firstChild);
      } else {
        this.fg.appendChild(imageDiv);
      }

      // After a short delay, fade in the new image
      setTimeout(() => {
        //c imageDiv.style.opacity = this.config.opacity;
        
        // Only fade out the old image (second child) after the new one is visible
        if (this.fg.children.length > 1) {
          // Give new image some time to become fully visible
          setTimeout(() => {
            // Now fade out all other images
            for (let i = 1; i < this.fg.children.length; i++) {
              //c this.fg.children[i].style.opacity = 0;
            }
            
            // Wait for fade-out transition to complete before removing old images
            setTimeout(() => {
              // Remove old images, but keep the first one (which is our new image)
              while (this.fg.children.length > 1) {
                this.fg.removeChild(this.fg.lastChild);
              }
            }, this.config.animationSpeed);
          }, this.config.animationSpeed / 2); // Wait half the transition time before starting fade out
        }
      }, 50);

      // Update background if fill is enabled
      if (this.config.fill === true) {
        this.bk.style.backgroundImage = `url(${photoImage.url})`;
      }
      
      // Restart the timer
      this.startTimer();
    };
    
    // Start loading the image
    tempImage.src = photoImage.url;
  },

  socketNotificationReceived(notification, payload, source) {
    if (notification === "READY" && payload === this.identifier) {
      // Schedule update timer.
      this.getPhotos();
    }
  },

  /*
   * Schedule next update.
   *
   * argument delay number - Milliseconds before next update.
   *  If empty, this.config.updateInterval is used.
   */
  scheduleUpdate(delay) {
    let nextLoad = this.config.getInterval;
    if (typeof delay !== "undefined" && delay >= 0) {
      nextLoad = delay;
    }

    const self = this;
    setTimeout(() => {
      self.getPhotos();
    }, nextLoad);
  },

  /*
   * Generate a random index for a list of photos.
   *
   * argument photos Array<String> - Array with photos.
   *
   * return Number - Random index.
   */
  randomIndex(photos) {
    if (photos.length === 1) {
      return 0;
    }

    const generate = () => Math.floor(Math.random() * photos.length);

    let photoIndex =
      this.lastPhotoIndex === photos.length - 1 ? 0 : this.lastPhotoIndex + 1;
    if (!this.config.sequential) {
      photoIndex = generate();
    }
    this.lastPhotoIndex = photoIndex;

    return photoIndex;
  },

  /*
   * Retrieve a random photos.
   *
   * return photo Object - A photo.
   */
  randomPhoto() {
    const { photos } = this;
    const index = this.randomIndex(photos);

    return photos[index];
  },

  scaleImage(srcwidth, srcheight, targetwidth, targetheight, fLetterBox) {
    const result = { width: 0, height: 0, fScaleToTargetWidth: true };

    if (
      srcwidth <= 0 ||
      srcheight <= 0 ||
      targetwidth <= 0 ||
      targetheight <= 0
    ) {
      return result;
    }

    // Scale to the target width
    const scaleX1 = targetwidth;
    const scaleY1 = (srcheight * targetwidth) / srcwidth;

    // Scale to the target height
    const scaleX2 = (srcwidth * targetheight) / srcheight;
    const scaleY2 = targetheight;

    // Now figure out which one we should use
    let fScaleOnWidth = scaleX2 > targetwidth;
    if (fScaleOnWidth) {
      fScaleOnWidth = fLetterBox;
    } else {
      fScaleOnWidth = !fLetterBox;
    }

    if (fScaleOnWidth) {
      result.width = Math.floor(scaleX1);
      result.height = Math.floor(scaleY1);
      result.fScaleToTargetWidth = true;
    } else {
      result.width = Math.floor(scaleX2);
      result.height = Math.floor(scaleY2);
      result.fScaleToTargetWidth = false;
    }
    result.targetleft = Math.floor((targetwidth - result.width) / 2);
    result.targettop = Math.floor((targetheight - result.height) / 2);

    return result;
  },

  suspend() {
    this.suspended = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  },
  resume() {
    this.suspended = false;
    if (this.timer === null) {
      this.startTimer();
    }
  },

  getDom() {
    if (this.fullscreen) {
      return this.getDomFS();
    }
    return this.getDomnotFS();
  },

  getDomnotFS() {
    const self = this;
    const wrapper = document.createElement("div");
    const photoImage = this.randomPhoto();

    if (photoImage) {
      const imageDiv = document.createElement("div");
      imageDiv.id = "mmm-images-photos";
      imageDiv.style.maxWidth = this.config.maxWidth;
      imageDiv.style.maxHeight = this.config.maxHeight;
      imageDiv.style.opacity = self.config.opacity;
      imageDiv.className = "bgimage";
      imageDiv.style.backgroundImage = `url(${photoImage.url})`;
      imageDiv.style.transition = `opacity ${self.config.animationSpeed / 1000}s`;
      wrapper.appendChild(imageDiv);
      self.startTimer();
    }
    return wrapper;
  },

  getDomFS() {
    const self = this;
    // If wrapper div not yet created
    if (this.wrapper === null) {
      // Create it once, try to reduce image flash on change
      this.wrapper = document.createElement("div");
      this.bk = document.createElement("div");
      this.bk.className = "bgimagefs";
      if (this.config.fill === true) {
        this.bk.style.filter = `blur(${this.config.blur}px)`;
        this.bk.style["-webkit-filter"] = `blur(${this.config.blur}px)`;
      } else {
        this.bk.style.backgroundColor = this.config.backgroundColor;
      }
      this.wrapper.appendChild(this.bk);
      this.fg = document.createElement("div");
      this.wrapper.appendChild(this.fg);
    }
    if (this.photos.length) {
      // Get the size of the margin, if any, we want to be full screen
      const m = window
        .getComputedStyle(document.body, null)
        .getPropertyValue("margin-top");
      // Set the style for the containing div

      this.fg.style.border = "none";
      this.fg.style.margin = "0px";

      const photoImage = this.randomPhoto();
      if (photoImage) {
        // Create a new image object to preload the image
        const tempImage = new Image();
        tempImage.src = photoImage.url;

        // Set error handler for the image load
        tempImage.onerror = () => {
          Log.error(`image load failed=${tempImage.src}`);
          this.updateImage();
        };

        // Set onload handler for the image
        tempImage.onload = () => {
          Log.log(`image loaded=${tempImage.src} size=${tempImage.width}:${tempImage.height}`);

          // What's the size of this image and its parent
          const w = tempImage.width;
          const h = tempImage.height;
          const tw = document.body.clientWidth + parseInt(m, 10) * 2;
          const th = document.body.clientHeight + parseInt(m, 10) * 2;

          // Compute the new size and offsets
          const result = self.scaleImage(w, h, tw, th, true);

          // Create a div for displaying the image
          const imageDiv = document.createElement("div");
          imageDiv.style.position = "relative";
          imageDiv.style.left = `${result.targetleft}px`;
          imageDiv.style.top = `${result.targettop}px`;
          imageDiv.style.width = `${result.width}px`;
          imageDiv.style.height = `${result.height}px`;
          imageDiv.style.backgroundImage = `url(${photoImage.url})`;
          imageDiv.style.backgroundSize = 'cover';
          imageDiv.style.backgroundPosition = 'center';
          imageDiv.style.backgroundRepeat = 'no-repeat';
          
          // Initially invisible
          //c imageDiv.style.opacity = 0;

          // Append the div to the container
          this.fg.appendChild(imageDiv);

          // Add transition effect
          //c imageDiv.style.transition = `opacity ${self.config.animationSpeed / 1000}s`;
          
          // If another image div was already displayed
          const c = self.fg.childElementCount;
          if (c > 1) {
            // Make new image visible with configured opacity
            //c imageDiv.style.opacity = self.config.opacity;
            
            // Wait for the new image to be visible
            setTimeout(() => {
              // Then fade out previous images
              for (let i = 0; i < c - 1; i++) {
                const prevImage = self.fg.children[i+1];
                //c prevImage.style.opacity = 0;
                prevImage.style.backgroundColor = "rgba(0,0,0,0)";
              }
              
              // Wait for fade-out to complete before removing
              setTimeout(() => {
                // Remove old div elements but keep the new one
                while (self.fg.childElementCount > 1) {
                  self.fg.removeChild(self.fg.lastChild);
                }
              }, self.config.animationSpeed);
            }, self.config.animationSpeed);
          } else {
            // Make current div visible with the configured opacity
            //c imageDiv.style.opacity = self.config.opacity;
          }

          // Set background image for the background div if fill is enabled
          if (self.config.fill === true) {
            self.bk.style.backgroundImage = `url(${photoImage.url})`;
          }
          self.startTimer();
        };
      }
    }
    return this.wrapper;
  },

  getScripts() {
    return ["MMM-ImagesPhotos.css"];
  },

  processPhotos(data) {
    const self = this;
    this.photos = data;
    if (this.loaded === false) {
      if (this.suspended === false) {
        // First time loading needs DOM creation
        self.updateDom(self.config.animationSpeed);
      }
    } else if (this.suspended === false) {
      // For subsequent loads, just update the image directly
      self.updateImage();
    }
    this.loaded = true;
  }
});
