define(function(require) {
	"use strict";
	/* RequireJS Module Loading */
	const Formulas = require("src/scripts/Formulas.js");
	const Mouse = require("src/scripts/Mouse.js");
	const Keyboard = require("src/scripts/Keyboard.js");
	const beatmap = require("src/scripts/DefaultBeatMaps.js");
	let useBeatmapSet = 2;
	let useBeatmap = 0;
	// const beatmap[useBeatmapSet][useBeatmap] = require("src/scripts/BeatMap.js");
	const StarRating = require("src/scripts/StarRating.js");
	const Beizer = require("src/scripts/Beizer.js");
	const utils = require("src/scripts/utils.js");
	const HitObject = require("src/scripts/HitObject.js");
	const HitEvent = require("src/scripts/HitEvent.js");
	const AssetLoader = require("src/scripts/AssetLoader.js");
	const Assets = require("src/scripts/GameplayAssets.js");
	const Canvas = require("src/scripts/Canvas.js");
	const skin = require("src/scripts/DefaultSkin.js");
	/* canvas setup */
	let canvas = new Canvas("gameplay", "body");
	canvas.setHeight(window.innerHeight);
	canvas.setWidth(window.innerWidth);
	let ctx = canvas.context;
	/* inputs setup */
	let mouse = new Mouse("body", 10);
	let keyboard = new Keyboard("body");
	mouse.setPosition(window.innerWidth / 2, window.innerHeight / 2);
	mouse.init();
	mouse.sensitivity = 1;
	mouse.positionBound(0, 0, window.innerWidth, window.innerHeight);
	keyboard.init();
	let keyboardLeftReleased = false;
	let keyboardRightReleased = false;
	ctx.font = "16px Arial";
	canvas.setFillStyle("#fff");
	let currentHitObject = 0;
	let hitEvents = [];
	let hitObjects = [];
	let hitErrors = [];
	let scoreObjects = [];
	let firstClick = true;
	/* Details about the play, including replays */
	let playDetails = {
		score: 0,
		accuracy: 0,
		maxCombo: 0,
		unstableRate: 0,
		hitDetails: {
			total300s: 0,
			total100s: 0,
			total50s: 0,
			totalMisses: 0,
			totalSliderElements: 0,
			totalSliderTicks: 0,
			totalSpinnerSpins: 0,
			totalSpinnerBonusSpin: 0,
		},
		mods: {
			easy: false,
			noFail: false,
			halfTime: false,
			hardRock: false,
			suddenDeath: false,
			perfect: false,
			doubleTime: false,
			nightCore: false,
			hidden: false,
			flashLight: false,
			relax: false,
			autoPilot: false,
			spunOut: false,
			auto: true,
			cinema: false,
			scoreV2: false,
		},
		replay: "TODO",
	};
	console.log(StarRating.calculate(beatmap[useBeatmapSet][useBeatmap], playDetails.mods));
	/* Playfield calculations and data */
	let playfieldSize = 0.8;
	let playfieldXOffset = 0;
	let playfieldYOffset = window.innerHeight / 50;
	/* Beatmap difficulty data */
	let arTime = Formulas.AR(beatmap[useBeatmapSet][useBeatmap].ApproachRate, playDetails.mods);
	let arFadeIn = Formulas.ARFadeIn(beatmap[useBeatmapSet][useBeatmap].ApproachRate, playDetails.mods);
	/* Map from osu!pixels to screen pixels */
	let circleDiameter = utils.map(Formulas.CS(beatmap[useBeatmapSet][useBeatmap].CircleSize, playDetails.mods) * 2, 0, 512, 0, window.innerHeight * playfieldSize * (4 / 3));
	let difficultyMultiplier = Formulas.difficultyPoints(beatmap[useBeatmapSet][useBeatmap].CircleSize, beatmap[useBeatmapSet][useBeatmap].HPDrainRate, beatmap[useBeatmapSet][useBeatmap].OverallDifficulty);
	let odTime = Formulas.ODHitWindow(beatmap[useBeatmapSet][useBeatmap].OverallDifficulty, playDetails.mods);
	/**/
	let currentHP = 1;
	let hpDisplay = 1;
	let previousTime = 0;
	/* Timing point indexes */
	let timingPointUninheritedIndex = 0;
	let currentTimingPoint = 0;
	/* Score variables */
	let scoreMultiplier = Formulas.modScoreMultiplier(playDetails.mods);
	let score = 0;
	let displayedScore = 0;
	/* Combo variables */
	let combo = 0;
	let comboPulseSize = 1;
	/* Audio variables */
	let backupStartTime = 0;
	let audio = AssetLoader.audio(`src/audio/${beatmap[useBeatmapSet][useBeatmap].AudioFilename}`);
	audio.currentTime = beatmap[useBeatmapSet][useBeatmap].hitObjects[0].time - 5;
	audio.playbackRate = 1;
	if (playDetails.mods.doubleTime) {
		audio.playbackRate = 1.5;
	} else if (playDetails.mods.halfTime) {
		audio.playbackRate = 0.75;
	}
	let failedToLoadAudio = false;
	/* 	attempting to run in offline on a chromebook causes audio loading errors
	 *	switch to performance.now instead
	 */
	audio.addEventListener("error", function() {
		failedToLoadAudio = true;
		console.log("failed to load audio");
	});
	/* Profiling variables */
	let times = [];
	let frameRate = 0;
	/* spinner tests */
	let previousSigns = [];
	let previousAngle = 0;
	let angle = 0;
	window.addEventListener("click", function() {
		if (firstClick) {
			firstClick = false;
			mouse.lockPointer();
			if (failedToLoadAudio === false) {
				audio.play();
			}
			if (failedToLoadAudio) {
				backupStartTime = window.performance.now();
			}
			(function animate() {
				let useTime = audio.currentTime;
				if (failedToLoadAudio) {
					useTime = (window.performance.now() - backupStartTime) / 1000;
				}
				ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
				canvas.setStrokeStyle("#000");
				ctx.lineWidth = 2;
				ctx.beginPath();
				ctx.rect(playfieldXOffset + window.innerWidth / 2 - window.innerHeight * playfieldSize * (4 / 3) / 2, playfieldYOffset + window.innerHeight / 2 - window.innerHeight * playfieldSize / 2, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize);
				ctx.stroke();
				ctx.closePath();
				let hitObjectOffsetX = playfieldXOffset + window.innerWidth / 2 - window.innerHeight * playfieldSize * (4 / 3) / 2;
				let hitObjectOffsetY = playfieldYOffset + window.innerHeight / 2 - window.innerHeight * playfieldSize / 2;
				canvas.setStrokeStyle("#fff");
				ctx.lineWidth = 5;
				let b = utils.mapToOsuPixels(256, 192, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
				previousAngle = angle;
				angle = Math.atan2(mouse.position.y - b.y, mouse.position.x - b.x);
				if (Math.sign(angle) === -1) {
					angle = Math.PI * 2 + angle;
				}
				let angleChange = ((angle - previousAngle) / (useTime - previousTime));
				if (isNaN(angleChange)) {
					angleChange = 0;
				}
				/* hard limit spinner speed at 50rad/s or ~477 rpm */
				if (angleChange >= 50) {
					angleChange = 50;
				}
				if (angleChange <= -50) {
					angleChange = -50;
				}
				/* Detect sudden sign changes due to rollover every spin*/
				if (previousSigns.length > 10) {
					previousSigns.splice(0, 1);
				}
				previousSigns.push(Math.sign(angleChange));
				let averageSign = 0;
				for (var i = 0; i < previousSigns.length; i++) {
					averageSign += previousSigns[i];
				}
				if (Math.sign(averageSign) !== Math.sign(angleChange)) {
					angleChange *= -1;
				}
				if (currentHP >= 1) {
					currentHP = 1;
				}
				if (currentHP <= 0) {
					currentHP = 0;
				}
				currentHP -= Formulas.HPDrain(beatmap[useBeatmapSet][useBeatmap].HPDrainRate, useTime - previousTime);
				hpDisplay += (currentHP - hpDisplay) / 8;
				canvas.setImageAlignment("top-left");
				canvas.drawImage(Assets.scoreBarBg, 10, 10, window.innerWidth / 2, Assets.scoreBarBg.height);
				canvas.drawImage(Assets.scoreBarColour, 0, 0, utils.map(hpDisplay, 0, 1, 0, Assets.scoreBarColour.width), Assets.scoreBarColour.height, 15, 10 + Assets.scoreBarColour.height / 1.5, utils.map(hpDisplay, 0, 1, 0, window.innerWidth / 2 - 0.01 * window.innerWidth), Assets.scoreBarColour.height);
				/* Hit Events */
				while (hitEvents.length > 0) {
					switch (hitEvents[0].score) {
						/* slider bonus spin */
						case 1000:
							playDetails.hitDetails.totalSliderBonusSpin++;
							break;
							/* great*/
						case 300:
							playDetails.hitDetails.total300s++;
							break;
							/* good or spinner spin */
						case 100:
							if (hitEvents[0].type === "hit-circle") {
								playDetails.hitDetails.total100s++;
							} else {
								playDetails.hitDetails.totalSpinnerSpins++;
							}
							break;
							/* meh */
						case 50:
							playDetails.hitDetails.total50s++;
							break;
							/* complete miss */
						case 0:
							playDetails.hitDetails.totalMisses++;
							break;
							/* Slider head, repeat and end */
						case 30:
							playDetails.hitDetails.totalSliderElements++;
							break;
							/* Slider tick */
						case 10:
							playDetails.hitDetails.totalSliderTicks++;
							break;
					}
					if ((hitEvents[0].score >= 50 || hitEvents[0].score === 0) && hitEvents[0].type === "hit-circle") {
						score += Formulas.hitScore(hitEvents[0].score, combo, difficultyMultiplier, scoreMultiplier);
						scoreObjects.push(new HitObject.ScoreObject(hitEvents[0].score, hitEvents[0].x, hitEvents[0].y, useTime + 1));
					} else {
						score += hitEvents[0].score;
					}
					if (hitEvents[0].combo === "increasing") {
						combo++;
						comboPulseSize = 1;
					} else if (hitEvents[0].combo === "reset") {
						combo = 0;
						document.getElementById("combo-container").innerHTML = "";
					}
					currentHP += Formulas.HP(beatmap[useBeatmapSet][useBeatmap].HPDrainRate, hitEvents[0].score, hitEvents[0].type, playDetails.mods);
					hitEvents.splice(0, 1);
				}
				while (currentHitObject < beatmap[useBeatmapSet][useBeatmap].hitObjects.length && useTime >= beatmap[useBeatmapSet][useBeatmap].hitObjects[currentHitObject].time - arTime) {
					hitObjects.push(beatmap[useBeatmapSet][useBeatmap].hitObjects[currentHitObject]);
					currentHitObject++;
				}
				/* +1 because the given time is beginning time, not end time */
				while (currentTimingPoint < beatmap[useBeatmapSet][useBeatmap].timingPoints.length - 1 && useTime >= beatmap[useBeatmapSet][useBeatmap].timingPoints[currentTimingPoint + 1].time) {
					currentTimingPoint++;
					if (beatmap[useBeatmapSet][useBeatmap].timingPoints[currentTimingPoint].uninherited === 1) {
						timingPointUninheritedIndex = currentTimingPoint;
					}
				}
				/* Cache Loop ---------------------------------------------------------------- */
				for (let i = 0; i < hitObjects.length; i++) {
					/* Cache Setup ---------------------------------------------------------------- */
					let sliderSpeedMultiplier = beatmap[useBeatmapSet][useBeatmap].SliderMultiplier;
					if (hitObjects[i].cache.cacheSet === false) {
						/* Immediate Cache Setup ---------------------------------------------------------------- */
						if (hitObjects[i].type[0] === "1") {
							/* Cache Setup for HitCircle ---------------------------------------------------------------- */
							hitObjects[i].cache.cacheSet = true;
						} else if (hitObjects[i].type[1] === "1") {
							hitObjects[i].cache.cacheSet = true;
							/* Cache Setup for Slider ---------------------------------------------------------------- */
							hitObjects[i].cache.hitHead = false;
							hitObjects[i].cache.hitEnd = false;
							hitObjects[i].cache.onFollowCircle = false;
							hitObjects[i].cache.hasHitAtAll = false;
							hitObjects[i].cache.hasEnded = false;
							hitObjects[i].cache.sliderBodyPosition = 0;
							hitObjects[i].cache.currentSlide = 0;
							hitObjects[i].cache.sliderTicksHit = 0;
							hitObjects[i].cache.repeatsHit = 0;
							hitObjects[i].cache.points = [];
							hitObjects[i].cache.timingPointUninheritedIndex = timingPointUninheritedIndex;
							/* Precalculate Slider Curve Points */
							/* Calculate Slider Points ---------------------------------------------------------------- */
							if (hitObjects[i].curveType === "B" || hitObjects[i].curveType === "C" || hitObjects[i].curveType === "L") {
								/* Slider Type Beizer, Catmull and Linear ---------------------------------------------------------------- */
								/* determine slider red / white anchor */
								let beizerTemp = [];
								for (let j = 0; j < hitObjects[i].curvePoints.length; j++) {
									if (hitObjects[i].curvePoints[j + 1] && hitObjects[i].curvePoints[j].x === hitObjects[i].curvePoints[j + 1].x && hitObjects[i].curvePoints[j].y === hitObjects[i].curvePoints[j + 1].y) {
										beizerTemp.push(hitObjects[i].curvePoints[j]);
										let point = Beizer(beizerTemp);
										for (let k = 0; k < point.length - 1; k++) {
											hitObjects[i].cache.points.push(point[k]);
										}
										beizerTemp = [];
									} else {
										beizerTemp.push(hitObjects[i].curvePoints[j]);
									}
								}
								let point = Beizer(beizerTemp);
								for (let k = 0; k < point.length; k++) {
									hitObjects[i].cache.points.push(point[k]);
								}
								beizerTemp = [];
							} else if (hitObjects[i].curveType === "P" && hitObjects[i].curvePoints.length === 3) {
								/* Slider Type Perfect Circle ---------------------------------------------------------------- */
								let circle = utils.circumcircle(hitObjects[i].curvePoints[0], hitObjects[i].curvePoints[1], hitObjects[i].curvePoints[2]);
								hitObjects[i].cache.points = utils.circleToPoints(circle.x, circle.y, circle.r, hitObjects[i].length, -utils.direction(circle.x, circle.y, hitObjects[i].curvePoints[0].x, hitObjects[i].curvePoints[0].y) - Math.PI / 2, utils.orientation(hitObjects[i].curvePoints[0], hitObjects[i].curvePoints[1], hitObjects[i].curvePoints[2]));
							}
						} else if (hitObjects[i].type[3] === "1") {
							hitObjects[i].cache.cacheSet = true;
							/* Cache Setup for Spinner ---------------------------------------------------------------- */
							hitObjects[i].cache.spins = 0;
							/* in rad/s */
							hitObjects[i].cache.velocity = 0;
							hitObjects[i].cache.spinnerBonus = false;
							hitObjects[i].cache.currentAngle = 0;
							hitObjects[i].cache.spinAngle = 0;
							hitObjects[i].cache.timeSpentAboveSpinnerMinimum = 0;
							hitObjects[i].cache.cleared = false;
						}
					}
					/* inherited timing point */
					if (beatmap[useBeatmapSet][useBeatmap].timingPoints[currentTimingPoint].uninherited === 0) {
						sliderSpeedMultiplier *= Formulas.sliderMultiplier(beatmap[useBeatmapSet][useBeatmap].timingPoints[currentTimingPoint].beatLength);
					}
					/* Cache Setup ---------------------------------------------------------------- */
					if (useTime >= hitObjects[i].time) {
						/* Cache Setup After Object Hit Time ---------------------------------------------------------------- */
						if (hitObjects[i].type[0] === "1" && hitObjects[i].cache.cacheSetAfterHit === false) {
							/* Cache Setup for HitCircle ---------------------------------------------------------------- */
							hitObjects[i].cache.cacheSetAfterHit = true;
						} else if (hitObjects[i].type[1] === "1" && hitObjects[i].cache.cacheSetAfterHit === false) {
							hitObjects[i].cache.cacheSetAfterHit = true;
							/* Cache Setup for Slider ---------------------------------------------------------------- */
							hitObjects[i].cache.sliderInheritedMultiplier = sliderSpeedMultiplier;
							hitObjects[i].cache.timingPointUninheritedIndex = timingPointUninheritedIndex;
							hitObjects[i].cache.sliderOnceTime = hitObjects[i].length / (hitObjects[i].cache.sliderInheritedMultiplier * 100) * beatmap[useBeatmapSet][useBeatmap].timingPoints[hitObjects[i].cache.timingPointUninheritedIndex].beatLength;
							hitObjects[i].cache.sliderTotalTime = hitObjects[i].cache.sliderOnceTime * hitObjects[i].slides;
							let time = hitObjects[i].length / (hitObjects[i].cache.sliderInheritedMultiplier * 100) * beatmap[useBeatmapSet][useBeatmap].timingPoints[hitObjects[i].cache.timingPointUninheritedIndex].beatLength;
							/* Actual ticks is -1 due to unexplicable phenomenon */
							hitObjects[i].cache.totalTicks = time / beatmap[useBeatmapSet][useBeatmap].timingPoints[hitObjects[i].cache.timingPointUninheritedIndex].beatLength * beatmap[useBeatmapSet][useBeatmap].SliderTickRate;
							hitObjects[i].cache.specificSliderTicksHit = [];
							for (let j = 0; j < hitObjects[i].slides; j++) {
								let tempArray = [];
								for (let k = 0; k < hitObjects[i].cache.totalTicks - 1; k++) {
									tempArray.push(false);
								}
								hitObjects[i].cache.specificSliderTicksHit.push(tempArray);
							}
							hitObjects[i].cache.specificSliderTicksPosition = [];
							let inc = hitObjects[i].cache.points.length / (hitObjects[i].cache.totalTicks);
							for (let j = 0; j < hitObjects[i].slides; j++) {
								let tempArray = [];
								if (j % 2 === 0) {
									for (let k = 0; k < hitObjects[i].cache.points.length; k += inc) {
										if (Math.floor(k) !== 0) {
											tempArray.push(Math.floor(k));
										}
									}
								} else {
									for (let k = hitObjects[i].cache.points.length - 1; k >= 0; k -= inc) {
										if (Math.floor(k) !== hitObjects[i].cache.points.length - 1) {
											tempArray.push(Math.floor(k));
										}
									}
								}
								hitObjects[i].cache.specificSliderTicksPosition.push(tempArray);
							}
							hitObjects[i].cache.totalTicks = hitObjects[i].cache.specificSliderTicksPosition[0].length;
						} else if (hitObjects[i].type[3] === "1" && hitObjects[i].cache.cacheSetAfterHit === false) {
							hitObjects[i].cache.cacheSetAfterHit = true;
							/* Cache Setup for Spinner ---------------------------------------------------------------- */
						}
					}
				}
				/* Processing Loop ---------------------------------------------------------------- */
				for (let i = 0; i < hitObjects.length; i++) {
					let hitObjectMapped = utils.mapToOsuPixels(hitObjects[i].x, hitObjects[i].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
					if (playDetails.mods.auto) {
					if (hitObjects[i].type[0] === "1" && useTime >= hitObjects[i].time) {
						mouse.setPosition(hitObjectMapped.x, hitObjectMapped.y);
						keyboard.emulateKeyDown("z");
					}
					if (hitObjects[i].type[1] === "1" && useTime >= hitObjects[i].time) {
						let sliderBodyPos = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.sliderBodyPosition].x, hitObjects[i].cache.points[hitObjects[i].cache.sliderBodyPosition].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
						mouse.setPosition(sliderBodyPos.x, sliderBodyPos.y);
						keyboard.emulateKeyDown("z");
					}
					if (hitObjects[i].type[3] === "1" && useTime >= hitObjects[i].time) {
						angleChange = 50;
					}
				}
					/* Hit Circle Hit Handling ---------------------------------------------------------------- */
					if (hitObjects[i].type[0] === "1" && utils.dist(mouse.position.x, mouse.position.y, hitObjectMapped.x, hitObjectMapped.y) <= circleDiameter / 2 && ((keyboard.getKeyDown("z") && keyboardLeftReleased) || (keyboard.getKeyDown("x") && keyboardRightReleased))) {
						if (keyboard.getKeyDown("z") && keyboardLeftReleased) {
							keyboardLeftReleased = false;
						}
						if (keyboard.getKeyDown("x") && keyboardRightReleased) {
							keyboardRightReleased = false;
						}
						let hitWindowScore = 0;
						if (utils.withinRange(useTime, hitObjects[i].time, odTime[0])) {
							if (utils.withinRange(useTime, hitObjects[i].time, odTime[2])) {
								hitWindowScore = 300;
							} else if (utils.withinRange(useTime, hitObjects[i].time, odTime[1])) {
								hitWindowScore = 100;
							} else if (utils.withinRange(useTime, hitObjects[i].time, odTime[0])) {
								hitWindowScore = 50;
							}
							hitErrors.push(useTime - hitObjects[i].time);
							hitObjects[i].cache.hasHit = true;
							hitObjects[i].cache.hitTime = useTime;
							hitEvents.push(new HitEvent("hit-circle", hitWindowScore, "increasing", hitObjectMapped.x, hitObjectMapped.y));
						} else {
							hitEvents.push(new HitEvent("hit-circle", 0, "reset", hitObjectMapped.x, hitObjectMapped.y));
						}
						hitObjects.splice(i, 1);
						i--;
					}
					/* Out of Index Handling ---------------------------------------------------------------- */
					if (i <= -1) {
						i = 0;
						if (hitObjects.length === 0) {
							continue;
						}
					}
					/* Slider Follow Circle Handling ---------------------------------------------------------------- */
					if (hitObjects[i].type[1] === "1" && useTime >= hitObjects[i].time) {
						if (hitObjects[i].cache.currentSlide < hitObjects[i].slides) {
							let sliderRepeat = false;
							let time = hitObjects[i].length / (hitObjects[i].cache.sliderInheritedMultiplier * 100) * beatmap[useBeatmapSet][useBeatmap].timingPoints[hitObjects[i].cache.timingPointUninheritedIndex].beatLength;
							if (hitObjects[i].cache.currentSlide % 2 === 0) {
								hitObjects[i].cache.sliderBodyPosition = Math.floor(utils.map(useTime, hitObjects[i].time + time * hitObjects[i].cache.currentSlide, hitObjects[i].time + time * (hitObjects[i].cache.currentSlide + 1), 0, hitObjects[i].cache.points.length - 1));
								/* Prevent Index Errors */
								if (hitObjects[i].cache.sliderBodyPosition <= 0) {
									hitObjects[i].cache.sliderBodyPosition = 0;
								}
								/* Check if slider repeats, then switch direction */
								if (hitObjects[i].cache.sliderBodyPosition >= hitObjects[i].cache.points.length - 1) {
									hitObjects[i].cache.sliderBodyPosition = hitObjects[i].cache.points.length - 1;
									sliderRepeat = true;
								}
								/* Check if slider follow circle went over slider ticks */
								for (let j = 0; j < hitObjects[i].cache.specificSliderTicksPosition[hitObjects[i].cache.currentSlide].length; j++) {
									if (hitObjects[i].cache.specificSliderTicksHit[hitObjects[i].cache.currentSlide][j] === false && (keyboard.getKeyDown("z") || keyboard.getKeyDown("x"))) {
										let mapped = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.specificSliderTicksPosition[hitObjects[i].cache.currentSlide][j]].x, hitObjects[i].cache.points[hitObjects[i].cache.specificSliderTicksPosition[hitObjects[i].cache.currentSlide][j]].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
										let sliderBodyPos = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.sliderBodyPosition].x, hitObjects[i].cache.points[hitObjects[i].cache.sliderBodyPosition].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
										if (utils.dist(mapped.x, mapped.y, sliderBodyPos.x, sliderBodyPos.y) <= circleDiameter / 4 && utils.dist(mouse.position.x, mouse.position.y, sliderBodyPos.x, sliderBodyPos.y) <= circleDiameter * 2.4 / 2 && hitObjects[i].cache.onFollowCircle) {
											hitObjects[i].cache.specificSliderTicksHit[hitObjects[i].cache.currentSlide][j] = true;
											hitObjects[i].cache.sliderTicksHit++;
											hitEvents.push(new HitEvent("slider-tick", 10, "increasing", mapped.x, mapped.y));
										}
									}
								}
								let sliderBodyPos = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.sliderBodyPosition].x, hitObjects[i].cache.points[hitObjects[i].cache.sliderBodyPosition].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
								if (utils.dist(mouse.position.x, mouse.position.y, sliderBodyPos.x, sliderBodyPos.y) <= circleDiameter * 2.4 / 2 && hitObjects[i].cache.onFollowCircle && (keyboard.getKeyDown("z") || keyboard.getKeyDown("x"))) {
									hitObjects[i].cache.onFollowCircle = true;
								} else if (utils.dist(mouse.position.x, mouse.position.y, sliderBodyPos.x, sliderBodyPos.y) <= circleDiameter / 2 && (keyboard.getKeyDown("z") || keyboard.getKeyDown("x"))) {
									hitObjects[i].cache.onFollowCircle = true;
								} else {
									hitObjects[i].cache.onFollowCircle = false;
								}
							} else if (hitObjects[i].cache.currentSlide % 2 === 1) {
								hitObjects[i].cache.sliderBodyPosition = Math.floor(utils.map(useTime, hitObjects[i].time + time * hitObjects[i].cache.currentSlide, hitObjects[i].time + time * (hitObjects[i].cache.currentSlide + 1), hitObjects[i].cache.points.length - 1, 0));
								/* Prevent Index Errors */
								if (hitObjects[i].cache.sliderBodyPosition >= hitObjects[i].cache.points.length - 1) {
									hitObjects[i].cache.sliderBodyPosition = hitObjects[i].cache.points.length - 1;
								}
								/* Check if Slider Repeats, then switch direction */
								if (hitObjects[i].cache.sliderBodyPosition <= 0) {
									hitObjects[i].cache.sliderBodyPosition = 0;
									sliderRepeat = true;
								}
								/* Check if slider follow circle went over slider ticks */
								for (let j = 0; j < hitObjects[i].cache.specificSliderTicksPosition[hitObjects[i].cache.currentSlide].length; j++) {
									if (hitObjects[i].cache.specificSliderTicksHit[hitObjects[i].cache.currentSlide][j] === false && (keyboard.getKeyDown("z") || keyboard.getKeyDown("x"))) {
										let mapped = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.specificSliderTicksPosition[hitObjects[i].cache.currentSlide][j]].x, hitObjects[i].cache.points[hitObjects[i].cache.specificSliderTicksPosition[hitObjects[i].cache.currentSlide][j]].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
										let sliderBodyPos = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.sliderBodyPosition].x, hitObjects[i].cache.points[hitObjects[i].cache.sliderBodyPosition].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
										if (utils.dist(mapped.x, mapped.y, sliderBodyPos.x, sliderBodyPos.y) <= circleDiameter / 4 && utils.dist(mouse.position.x, mouse.position.y, sliderBodyPos.x, sliderBodyPos.y) <= circleDiameter * 2.4 / 2 && hitObjects[i].cache.onFollowCircle) {
											hitObjects[i].cache.specificSliderTicksHit[hitObjects[i].cache.currentSlide][j] = true;
											hitObjects[i].cache.sliderTicksHit++;
											hitEvents.push(new HitEvent("slider-tick", 10, "increasing", mapped.x, mapped.y));
										}
									}
								}
								let sliderBodyPos = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.sliderBodyPosition].x, hitObjects[i].cache.points[hitObjects[i].cache.sliderBodyPosition].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
								if (utils.dist(mouse.position.x, mouse.position.y, sliderBodyPos.x, sliderBodyPos.y) <= circleDiameter * 2.4 / 2 && hitObjects[i].cache.onFollowCircle && (keyboard.getKeyDown("z") || keyboard.getKeyDown("x"))) {
									hitObjects[i].cache.onFollowCircle = true;
								} else if (utils.dist(mouse.position.x, mouse.position.y, sliderBodyPos.x, sliderBodyPos.y) <= circleDiameter / 2 && (keyboard.getKeyDown("z") || keyboard.getKeyDown("x"))) {
									hitObjects[i].cache.onFollowCircle = true;
								} else {
									hitObjects[i].cache.onFollowCircle = false;
								}
							}
							if (sliderRepeat) {
								hitObjects[i].cache.currentSlide++;
								if (hitObjects[i].cache.currentSlide < hitObjects[i].slides) {
									let sliderBodyPos = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.sliderBodyPosition].x, hitObjects[i].cache.points[hitObjects[i].cache.sliderBodyPosition].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
									if (utils.dist(mouse.position.x, mouse.position.y, sliderBodyPos.x, sliderBodyPos.y) <= circleDiameter * 2.4 / 2 && hitObjects[i].cache.onFollowCircle && (keyboard.getKeyDown("z") || keyboard.getKeyDown("x"))) {
										hitObjects[i].cache.repeatsHit++;
										hitEvents.push(new HitEvent("slider-element", 30, "increasing", sliderBodyPos.x, sliderBodyPos.y));
									} else if (hitObjects[i].cache.currentSlide < hitObjects[i].slides) {
										hitEvents.push(new HitEvent("slider-element-miss", 0, "reset", sliderBodyPos.x, sliderBodyPos.y));
									}
								}
							}
						} else {
							hitObjects[i].cache.hasEnded = true;
							if (hitObjects[i].cache.currentSlide % 2 === 0) {
								if (utils.dist(mouse.position.x, mouse.position.y, hitObjects[i].cache.points[0].x, hitObjects[i].cache.points[0].y) <= circleDiameter / 2) {
									hitObjects[i].cache.hitEnd = true;
									hitObjects[i].cache.hasHitAtAll = true;
								}
							} else if (hitObjects[i].cache.currentSlide % 2 === 1) {
								if (utils.dist(mouse.position.x, mouse.position.y, hitObjects[i].cache.points[hitObjects[i].cache.points.length - 1].x, hitObjects[i].cache.points[hitObjects[i].cache.points.length - 1].y) <= circleDiameter / 2) {
									hitObjects[i].cache.hitEnd = true;
									hitObjects[i].cache.hasHitAtAll = true;
								}
							}
						}
					}
					/* Slider Head Hit Handling ---------------------------------------------------------------- */
					if (hitObjects[i].type[1] === "1" && hitObjects[i].cache.hitHead === false && utils.dist(mouse.position.x, mouse.position.y, hitObjectMapped.x, hitObjectMapped.y) <= circleDiameter / 2 && ((keyboard.getKeyDown("z") && keyboardLeftReleased) || (keyboard.getKeyDown("x") && keyboardRightReleased)) && utils.withinRange(useTime, hitObjects[i].time, odTime[0])) {
						if (keyboard.getKeyDown("z") && keyboardLeftReleased) {
							keyboardLeftReleased = false;
						}
						if (keyboard.getKeyDown("x") && keyboardRightReleased) {
							keyboardRightReleased = false;
						}
						hitErrors.push(useTime - hitObjects[i].time);
						hitEvents.push(new HitEvent("slider-element", 30, "increasing", hitObjectMapped.x, hitObjectMapped.y));
						hitObjects[i].cache.hitHead = true;
						hitObjects[i].cache.hasHitAtAll = true;
					}
					/* Slider Tick Miss Check ---------------------------------------------------------------- */
					// if (hitObjects[i].type[1] === "1" && useTime >= hitObjects[i].time) {
					// 	let copy = [];
					// 	let matches = 0;
					// 	let totalOccurences = 0;
					// 	for (let j = 0; j < hitObjects[i].cache.specificSliderTicksHit.length; j++) {
					// 		copy.push(hitObjects[i].cache.specificSliderTicksHit[j]);
					// 	}
					// 	copy.sort(function(x, y) {
					// 		return (x === y) ? 0 : x ? -1 : 1;
					// 	});
					// 	for (let j = 0; j < copy.length; j++) {
					// 		if (copy[j]) {
					// 			totalOccurences++;
					// 		}
					// 		if (copy[j] === hitObjects[i].cache.specificSliderTicksHit[j] && copy[j]) {
					// 			matches++;
					// 		}
					// 	}
					// 	if (matches !== totalOccurences) {
					// 		combo = 0;
					// 		document.getElementById("combo-container").innerHTML = "";
					// 	}
					// }
					/* Slider Score Calculations ---------------------------------------------------------------- */
					if (hitObjects[i].type[1] === "1" && hitObjects[i].cache.hasEnded) {
						let sliderElementsHit = 0;
						/* 1 head */
						/* 1 end */
						/* 1 follow circle */
						/* n repeats */
						/* m * n ticks */
						let totalSliderElements = 1 + hitObjects[i].slides + hitObjects[i].slides * hitObjects[i].cache.totalTicks;
						if (hitObjects[i].cache.hitHead) {
							sliderElementsHit++;
						}
						if (hitObjects[i].cache.hitEnd) {
							sliderElementsHit++;
						}
						if (hitObjects[i].cache.onFollowCircle) {
							sliderElementsHit++;
						}
						sliderElementsHit += hitObjects[i].cache.repeatsHit;
						for (var j = 0; j < hitObjects[i].cache.specificSliderTicksHit.length; j++) {
							for (var k = 0; k < hitObjects[i].cache.specificSliderTicksHit[j].length; k++) {
								if (hitObjects[i].cache.specificSliderTicksHit[j][k]) {
									sliderElementsHit++;
								}
							}
						}
						let mapped;
						if (hitObjects[i].slides % 2 === 0) {
							mapped = utils.mapToOsuPixels(hitObjects[i].x, hitObjects[i].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
						} else {
							mapped = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.points.length - 1].x, hitObjects[i].cache.points[hitObjects[i].cache.points.length - 1].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
						}
						let hitScore = 0;
						if (sliderElementsHit >= totalSliderElements) {
							hitScore = 300;
						} else if (sliderElementsHit >= 0.5 * totalSliderElements) {
							hitScore = 100;
						} else if (sliderElementsHit > 0) {
							hitScore = 50;
						}
						if (hitScore !== 0) {
							hitEvents.push(new HitEvent("hit-circle", hitScore, "increasing", mapped.x, mapped.y));
						} else {
							hitEvents.push(new HitEvent("hit-circle", 0, "reset", mapped.x, mapped.y));
						}
						hitObjects.splice(i, 1);
						i--;
					}
					/* Out of Index Handling ---------------------------------------------------------------- */
					if (i <= -1) {
						i = 0;
						if (hitObjects.length === 0) {
							continue;
						}
					}
					/* Miss (Outside OD window) calculation ---------------------------------------------------------------- */
					let miss = false;
					let mapped = hitObjectMapped;
					if (hitObjects[i].type[0] === "1" && useTime >= hitObjects[i].time + odTime[0] / 2) {
						miss = true;
					} else if (hitObjects[i].type[1] === "1" && hitObjects[i].cache.hasEnded && hitObjects[i].cache.hasHitAtAll === false) {
						miss = true;
						let mapped;
						if (hitObjects[i].slides % 2 === 0) {
							mapped = utils.mapToOsuPixels(hitObjects[i].x, hitObjects[i].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
						} else {
							mapped = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.points.length - 1].x, hitObjects[i].cache.points[hitObjects[i].cache.points.length - 1].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
						}
					}
					if (miss) {
						hitEvents.push(new HitEvent("hit-circle", 0, "reset", mapped.x, mapped.y));
						hitObjects.splice(i, 1);
						i--;
						document.getElementById("combo-container").innerHTML = "";
					}
					/* Out of Index Handling ---------------------------------------------------------------- */
					if (i <= -1) {
						i = 0;
						if (hitObjects.length === 0) {
							continue;
						}
					}
					/* Spinner handling ---------------------------------------------------------------- */
					if (hitObjects[i].type[3] === "1") {
						hitObjects[i].cache.velocity += (angleChange - hitObjects[i].cache.velocity) / 32;
						hitObjects[i].cache.currentAngle += hitObjects[i].cache.velocity * (useTime - previousTime);
						hitObjects[i].cache.spinAngle += hitObjects[i].cache.velocity * (useTime - previousTime);
						if (Math.abs(hitObjects[i].cache.velocity / (Math.PI)) >= Formulas.ODSpinner(beatmap[useBeatmapSet][useBeatmap].OverallDifficulty, playDetails.mods)) {
							hitObjects[i].cache.timeSpentAboveSpinnerMinimum += useTime - previousTime;
						}
						if (hitObjects[i].cache.timeSpentAboveSpinnerMinimum >= (hitObjects[i].endTime - hitObjects[i].time) * 0.25) {
							hitObjects[i].cache.cleared = true;
						}
						while (hitObjects[i].cache.spinAngle >= Math.PI * 2) {
							hitObjects[i].cache.spins++;
							hitObjects[i].cache.spinAngle -= Math.PI * 2;
							if (hitObjects[i].cache.cleared === false) {
								hitEvents.push(new HitEvent("spinner-spin", 100, "no-increase", mapped.x, mapped.y));
							} else {
								hitEvents.push(new HitEvent("spinner-bonus-spin", 1000, "no-increase", mapped.x, mapped.y));
							}
						}
						while (hitObjects[i].cache.spinAngle <= -Math.PI * 2) {
							hitObjects[i].cache.spins++;
							hitObjects[i].cache.spinAngle += Math.PI * 2;
							if (hitObjects[i].cache.cleared === false) {
								hitEvents.push(new HitEvent("spinner-spin", 100, "no-increase", mapped.x, mapped.y));
							} else {
								hitEvents.push(new HitEvent("spinner-bonus-spin", 1000, "no-increase", mapped.x, mapped.y));
							}
						}
					}
					/* Spinner end handling ---------------------------------------------------------------- */
					if (hitObjects[i].type[3] === "1" && useTime >= hitObjects[i].endTime) {
						let mapped = utils.mapToOsuPixels(256, 192, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
						if (hitObjects[i].cache.cleared) {
							hitEvents.push(new HitEvent("hit-circle", 300, "increasing", mapped.x, mapped.y));
						} else if (hitObjects[i].cache.timeSpentAboveSpinnerMinimum >= (hitObjects[i].endTime - hitObjects[i].time) * 0.25 * 0.75) {
							hitEvents.push(new HitEvent("hit-circle", 100, "increasing", mapped.x, mapped.y));
						} else if (hitObjects[i].cache.timeSpentAboveSpinnerMinimum >= (hitObjects[i].endTime - hitObjects[i].time) * 0.25 * 0.25) {
							hitEvents.push(new HitEvent("hit-circle", 50, "increasing", mapped.x, mapped.y));
						} else if (hitObjects[i].cache.timeSpentAboveSpinnerMinimum < (hitObjects[i].endTime - hitObjects[i].time) * 0.25 * 0.25) {
							hitEvents.push(new HitEvent("hit-circle", 0, "reset", mapped.x, mapped.y));
						}
						hitObjects.splice(i, 1);
						i--;
					}
					if (playDetails.mods.auto) {
						keyboard.emulateKeyUp("z");
					}
					if (keyboard.getKeyDown("z") === false) {
						keyboardLeftReleased = true;
					}
					if (keyboard.getKeyDown("x") === false) {
						keyboardRightReleased = true;
					}
				}
				/* Render Loop ---------------------------------------------------------------- */
				canvas.setImageAlignment("center");
				for (let i = hitObjects.length - 1; i >= 0; i--) {
					/* Approach Circle Calculations ---------------------------------------------------------------- */
					let approachCircleSize = utils.map(useTime - (hitObjects[i].time - arTime), 0, arTime, 5, 1.6);
					let hitObjectMapped = utils.mapToOsuPixels(hitObjects[i].x, hitObjects[i].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
					/* approach circle max size */
					if (approachCircleSize >= 5) {
						approachCircleSize = 5;
					}
					/* approach circle min size */
					if (approachCircleSize <= 1.6) {
						approachCircleSize = 1.6;
					}
					/* Alpha Calculations ---------------------------------------------------------------- */
					if (hitObjects[i].type[0] === "1") {
						if (playDetails.mods.hidden) {
							/* hidden fade in and out for hit circle */
							if (utils.map(useTime - (hitObjects[i].time - arTime), 0, arTime, 0, 1) <= 0.4) {
								canvas.setGlobalAlpha(utils.map(useTime - (hitObjects[i].time - arTime), 0, arTime * 0.4, 0, 1));
							} else if (utils.map(useTime - (hitObjects[i].time - arTime), 0, arTime, 0, 1) <= 0.7) {
								canvas.setGlobalAlpha(utils.map(useTime - (hitObjects[i].time - arTime), arTime * 0.4, arTime * 0.7, 1, 0));
							} else {
								canvas.setGlobalAlpha(0);
							}
						} else {
							/* normal fade in and out for hit circle */
							if (utils.map(useTime - (hitObjects[i].time - arTime), 0, arTime, 0, 1) <= 1) {
								canvas.setGlobalAlpha(utils.map(useTime - (hitObjects[i].time - arTime), 0, arFadeIn, 0, 1));
							} else {
								let alpha = utils.map(useTime - (hitObjects[i].time - arTime), arTime, arTime + odTime[0] / 2, 1, 0);
								if (alpha <= 0) {
									alpha = 0;
								}
								canvas.setGlobalAlpha(alpha);
							}
						}
					} else if (hitObjects[i].type[1] === "1") {
						if (utils.map(useTime - (hitObjects[i].time - arTime), 0, arTime, 0, 1) <= 1) {
							canvas.setGlobalAlpha(utils.map(useTime - (hitObjects[i].time - arTime), 0, arFadeIn, 0, 1));
						} else {
							canvas.setGlobalAlpha(1);
						}
					}
					/* Object Draw ---------------------------------------------------------------- */
					if (hitObjects[i].type[0] === "1") {
						/* Draw Hit Circle ---------------------------------------------------------------- */
						let size = circleDiameter;
						if (hitObjects[i].cache.hasHit || hitObjects[i].cache.hasMiss) {
							size *= utils.map(hitObjects[i].cache.hitTime - useTime, 0, 1, 1, 1.2);
						}
						canvas.drawImage(Assets.hitCircle, hitObjectMapped.x, hitObjectMapped.y, size, size);
						canvas.drawImage(Assets.hitCircleOverlay, hitObjectMapped.x, hitObjectMapped.y, size, size);
						if (playDetails.mods.hidden === false) {
							canvas.drawImage(Assets.approachCircle, hitObjectMapped.x, hitObjectMapped.y, size * approachCircleSize, size * approachCircleSize);
						}
						canvas.drawImage(Assets.comboNumbers[1], hitObjectMapped.x, hitObjectMapped.y);
					} else if (hitObjects[i].type[1] === "1") {
						/* Draw Slider ---------------------------------------------------------------- */
						/* Slider Curve calculated the at the hitobject time - ar time */
						ctx.lineCap = "round";
						ctx.lineJoin = 'round';
						/* Draw Outer Slider Body ---------------------------------------------------------------- */
						ctx.lineWidth = circleDiameter;
						canvas.setStrokeStyle("rgba(255, 255, 255, " + canvas.getGlobalAlpha() + ")");
						ctx.beginPath();
						for (let j = 0; j < hitObjects[i].cache.points.length - 1; j += 1) {
							let mapped = utils.mapToOsuPixels(hitObjects[i].cache.points[j].x, hitObjects[i].cache.points[j].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
							ctx.lineTo(mapped.x, mapped.y);
						}
						let mapped = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.points.length - 1].x, hitObjects[i].cache.points[hitObjects[i].cache.points.length - 1].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
						ctx.lineTo(mapped.x, mapped.y);
						ctx.stroke();
						/* Draw Inner Slider Body ---------------------------------------------------------------- */
						ctx.lineWidth = circleDiameter / 1.1;
						canvas.setStrokeStyle("#222");
						ctx.beginPath();
						for (let j = 0; j < hitObjects[i].cache.points.length - 1; j += 1) {
							let mapped = utils.mapToOsuPixels(hitObjects[i].cache.points[j].x, hitObjects[i].cache.points[j].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
							ctx.lineTo(mapped.x, mapped.y);
						}
						mapped = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.points.length - 1].x, hitObjects[i].cache.points[hitObjects[i].cache.points.length - 1].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
						ctx.lineTo(mapped.x, mapped.y);
						ctx.stroke();
						/* Draw Slider End ---------------------------------------------------------------- */
						if (hitObjects[i].slides > 1) {
							let mapped = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.points.length - 1].x, hitObjects[i].cache.points[hitObjects[i].cache.points.length - 1].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
							ctx.translate(mapped.x, mapped.y);
							ctx.rotate(-utils.direction(hitObjects[i].cache.points[hitObjects[i].cache.points.length - 4].x, hitObjects[i].cache.points[hitObjects[i].cache.points.length - 3].y, hitObjects[i].cache.points[hitObjects[i].cache.points.length - 2].x, hitObjects[i].cache.points[hitObjects[i].cache.points.length - 1].y) + Math.PI / 2);
							canvas.drawImage(Assets.hitCircle, 0, 0, circleDiameter, circleDiameter);
							canvas.drawImage(Assets.reverseArrow, 0, 0, circleDiameter, circleDiameter);
							ctx.resetTransform();
						} else {
							let mapped = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.points.length - 1].x, hitObjects[i].cache.points[hitObjects[i].cache.points.length - 1].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
							canvas.drawImage(Assets.hitCircle, mapped.x, mapped.y, circleDiameter, circleDiameter);
							canvas.drawImage(Assets.hitCircleOverlay, mapped.x, mapped.y, circleDiameter, circleDiameter);
						}
						/* Draw Slider Ticks ---------------------------------------------------------------- */
						if (hitObjects[i].cache.totalTicks >= 1 && hitObjects[i].cache.specificSliderTicksPosition[hitObjects[i].cache.currentSlide]) {
							for (let j = 0; j < hitObjects[i].cache.specificSliderTicksPosition[hitObjects[i].cache.currentSlide].length; j++) {
								if (hitObjects[i].cache.specificSliderTicksHit[hitObjects[i].cache.currentSlide][j]) {
									continue;
								}
								let mapped = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.specificSliderTicksPosition[hitObjects[i].cache.currentSlide][j]].x, hitObjects[i].cache.points[hitObjects[i].cache.specificSliderTicksPosition[hitObjects[i].cache.currentSlide][j]].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
								canvas.drawImage(Assets.sliderScorePoint, mapped.x, mapped.y);
							}
						}
						/* Draw Slider Head */
						if (hitObjects[i].cache.hitHead === false) {
							canvas.drawImage(Assets.hitCircle, hitObjectMapped.x, hitObjectMapped.y, circleDiameter, circleDiameter);
							canvas.drawImage(Assets.hitCircleOverlay, hitObjectMapped.x, hitObjectMapped.y, circleDiameter, circleDiameter);
							if (playDetails.mods.hidden === false) {
								canvas.drawImage(Assets.approachCircle, hitObjectMapped.x, hitObjectMapped.y, circleDiameter * approachCircleSize, circleDiameter * approachCircleSize);
							}
							canvas.drawImage(Assets.comboNumbers[1], hitObjectMapped.x, hitObjectMapped.y);
						}
						if (hitObjects[i].cache.sliderBodyPosition !== undefined && useTime >= hitObjects[i].time) {
							let mapped = utils.mapToOsuPixels(hitObjects[i].cache.points[hitObjects[i].cache.sliderBodyPosition].x, hitObjects[i].cache.points[hitObjects[i].cache.sliderBodyPosition].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
							let tempAlpha = canvas.getGlobalAlpha();
							canvas.setGlobalAlpha(1);
							canvas.drawImage(Assets.sliderBody, mapped.x, mapped.y, circleDiameter, circleDiameter);
							canvas.setGlobalAlpha(tempAlpha);
							if (hitObjects[i].cache.onFollowCircle) {
								canvas.drawImage(Assets.sliderFollowCircle, mapped.x, mapped.y, circleDiameter * 2.4, circleDiameter * 2.4);
							}
						}
					} else if (hitObjects[i].type[3] === "1") {
						if (hitObjects[i].cache.cleared) {
							canvas.drawImage(Assets.spinnerClear, window.innerWidth / 2, window.innerHeight / 4);
						}
						/* draw spinner */
						let mapped = utils.mapToOsuPixels(hitObjects[i].x, hitObjects[i].y, window.innerHeight * playfieldSize * (4 / 3), window.innerHeight * playfieldSize, hitObjectOffsetX, hitObjectOffsetY);
						ctx.translate(mapped.x, mapped.y);
						ctx.rotate(hitObjects[i].cache.currentAngle);
						let size = utils.map(hitObjects[i].endTime - useTime, 0, hitObjects[i].endTime - (hitObjects[i].time - arTime), 0, 0.8) * utils.map(Math.abs(hitObjects[i].cache.velocity), 0, 50, 1, 1.2);
						canvas.drawImage(Assets.spinnerApproachCircle, 0, 0, size * window.innerHeight, size * window.innerHeight);
						let tempAlpha = ctx.globalAlpha;
						canvas.setGlobalAlpha(1);
						canvas.drawImage(Assets.spinnerTop, 0, 0, 0.2 * window.innerHeight, 0.2 * window.innerHeight);
						canvas.setGlobalAlpha(tempAlpha);
						ctx.resetTransform();
					}
					canvas.setGlobalAlpha(1);
				}
				let size = 1;
				if (keyboard.getKeyDown("z") || keyboard.getKeyDown("x")) {
					size = 0.8;
				}
				for (let i = 0; i < scoreObjects.length; i++) {
					if (scoreObjects[i].lifetime - useTime >= 0) {
						let useImage = -1;
						switch (scoreObjects[i].score) {
							case 300:
								useImage = 0;
								break;
							case 100:
								useImage = 1;
								break;
							case 50:
								useImage = 2;
								break;
							case 0:
								useImage = 3;
								break;
						}
						canvas.setGlobalAlpha(utils.map(scoreObjects[i].lifetime - useTime, 1, 0, 1, 0));
						let size = circleDiameter * 0.75 * utils.map(scoreObjects[i].lifetime - useTime, 1, 0, 1, 1.1);
						canvas.drawImage(Assets.scoreNumbers[useImage], scoreObjects[i].x, scoreObjects[i].y, size, size);
					} else {
						scoreObjects.splice(i, 1);
						i--;
					}
				}
				canvas.setGlobalAlpha(1);
				canvas.setFillStyle("#ffcc22");
				ctx.fillRect(window.innerWidth / 2 - odTime[0] * 1000 / 2, window.innerHeight * 0.950, odTime[0] * 1000, window.innerHeight * 0.005);
				canvas.setFillStyle("#88b300");
				ctx.fillRect(window.innerWidth / 2 - odTime[1] * 1000 / 2, window.innerHeight * 0.950, odTime[1] * 1000, window.innerHeight * 0.005);
				canvas.setFillStyle("#66ccff");
				ctx.fillRect(window.innerWidth / 2 - odTime[2] * 1000 / 2, window.innerHeight * 0.950, odTime[2] * 1000, window.innerHeight * 0.005);
				for (let i = 0; i < hitErrors.length; i++) {
					let alpha = utils.map(i, 40, 0, 0, 1);
					if (alpha <= 0) {
						alpha = 0;
					}
					canvas.setGlobalAlpha(alpha);
					if (utils.withinRange(hitErrors[i], 0, odTime[2])) {
						canvas.setFillStyle("#66ccff");
					} else if (utils.withinRange(hitErrors[i], 0, odTime[1])) {
						canvas.setFillStyle("#88b300");
					} else if (utils.withinRange(hitErrors[i], 0, odTime[0])) {
						canvas.setFillStyle("#ffcc22");
					}
					ctx.fillRect(window.innerWidth / 2 + hitErrors[i] * 1000, window.innerHeight * 0.950 - window.innerHeight * 0.025 / 2, window.innerHeight * 0.005, window.innerHeight * 0.025);
				}
				canvas.setGlobalAlpha(1);
				canvas.setFillStyle("#fff");
				comboPulseSize -= comboPulseSize / 8;
				displayedScore += (score - displayedScore) / 8;
				/* update score html element */
				utils.htmlCounter(utils.reverse(Math.round(displayedScore) + ""), "score-container", "score-digit-", `src/images/skins/${skin}/fonts/aller/score-`, "left", "calc(100vw - " + (document.getElementById("score-container").childNodes.length * 2) + "vw)");
				/* update combo html element */
				utils.htmlCounter(utils.reverse(combo + "x"), "combo-container", "combo-digit-", `src/images/skins/${skin}/fonts/aller/score-`, "top", "calc(100vh - 52 / 32 * " + 2 * (comboPulseSize + 1) + "vw)");
				/* update accuracy html element */
				utils.htmlCounter("%" + utils.reverse("" + (Formulas.accuracy(playDetails.hitDetails.total300s, playDetails.hitDetails.total100s, playDetails.hitDetails.total50s, playDetails.hitDetails.totalMisses) * 100).toPrecision(4)), "accuracy-container", "accuracy-digit-", `src/images/skins/${skin}/fonts/aller/score-`, "left", "calc(100vw - " + (document.getElementById("accuracy-container").childNodes.length * 1) + "vw)");
				/* rank grade */
				document.getElementById("grade").src = `src/images/skins/${skin}/ranking-` + Formulas.grade(playDetails.hitDetails.total300s, playDetails.hitDetails.total100s, playDetails.hitDetails.total50s, playDetails.hitDetails.totalMisses, false) + "-small.png";
				/* combo pulse size */
				let els = document.getElementById("combo-container").querySelectorAll("img");
				for (let i = 0; i < els.length; i++) {
					els[i].style.width = 2 * (comboPulseSize + 1) + "vw";
				}
				/* mouse trails */
				for (let i = 0; i < mouse.previousPositions.x.length - 1; i++) {
					canvas.setGlobalAlpha(utils.map(i, 0, mouse.previousPositions.x.length - 1, 0, 1));
					for (let j = 0; j < utils.dist(mouse.previousPositions.x[i], mouse.previousPositions.y[i], mouse.previousPositions.x[i + 1], mouse.previousPositions.y[i + 1]) / (Assets.cursorTrail.width / 2); j++) {
						canvas.drawImage(Assets.cursorTrail, utils.map(j, 0, utils.dist(mouse.previousPositions.x[i], mouse.previousPositions.y[i], mouse.previousPositions.x[i + 1], mouse.previousPositions.y[i + 1]) / (Assets.cursorTrail.width / 2), mouse.previousPositions.x[i], mouse.previousPositions.x[i + 1]) - Assets.cursorTrail.width / 2, utils.map(j, 0, utils.dist(mouse.previousPositions.x[i], mouse.previousPositions.y[i], mouse.previousPositions.x[i + 1], mouse.previousPositions.y[i + 1]) / (Assets.cursorTrail.width / 2), mouse.previousPositions.y[i], mouse.previousPositions.y[i + 1]));
					}
				}
				canvas.setGlobalAlpha(1);
				canvas.drawImage(Assets.cursor, mouse.position.x, mouse.position.y, Assets.cursor.width * size, Assets.cursor.height * size);
				/* Profiling ----------------------------------------------------------------------------------------------- */
				const now = Date.now();
				while (times.length > 0 && times[0] <= now - 1000) {
					times.shift();
				}
				times.push(now);
				frameRate = times.length;
				document.getElementById("frame-rate").innerText = frameRate + " / 60 fps";
				if (frameRate > 60) {
					document.getElementById("frame-rate").style.background = "#6d9eeb";
				} else if (frameRate > 45) {
					document.getElementById("frame-rate").style.background = "#39e639";
				} else if (frameRate > 20) {
					document.getElementById("frame-rate").style.background = "#ffa500";
				} else {
					document.getElementById("frame-rate").style.background = "#B00020";
				}
				canvas.fillText(useTime, 10, 200);
				previousTime = useTime;
				setTimeout(animate, 0);
				// requestAnimationFrame(animate);
			})();
		}
	});
});