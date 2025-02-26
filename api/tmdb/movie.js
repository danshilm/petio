// Config
const getConfig = require("../util/config");

const fanartLookup = require("../fanart");
const request = require("xhr-request");
const onServer = require("../plex/onServer");
const imdb = require("../meta/imdb");

const ISO6391 = require("iso-639-1");

const logger = require("../util/logger");

const cacheManager = require("cache-manager");
const memoryCache = cacheManager.caching({
  store: "memory",
  max: 500,
  ttl: 86400 /*seconds*/,
});

async function movieLookup(id, minified = false) {
  logger.log("verbose", `TMDB Person Lookup ${id}`);
  let fanart = minified ? false : await fanartLookup(id, "movies");
  let movie = false;
  try {
    data = await getMovieData(id);
    movie = Object.assign({}, data);
  } catch {
    return { error: "not found" };
  }
  if (movie.success === false) {
    return { error: "not found" };
  }
  if (movie) {
    if (!movie.id) {
      return { error: "no id returned" };
    }
    if (fanart) {
      if (fanart.hdmovielogo) {
        movie.logo = findEnLogo(fanart.hdmovielogo);
      }
      if (fanart.moviethumb) {
        movie.tile = findEnLogo(fanart.moviethumb);
      }
    }
    if (minified) {
      // Pre-fetch IMDB on minfied lookup but don't wait or return
      imdb(movie.imdb_id);
    }
    try {
      let collectionData = false;
      let [
        onPlex,
        recommendations,
        imdb_data,
        collection,
        reviews,
      ] = await Promise.all([
        onServer("movie", movie.imdb_id, false, id),
        getRecommendations(id),
        !minified && movie.imdb_id ? imdb(movie.imdb_id) : false,
        !minified && movie.belongs_to_collection
          ? getCollection(movie.belongs_to_collection.id)
          : false,
        !minified ? getReviews(id) : false,
      ]);

      let recommendationsData = [];
      movie.on_server = onPlex.exists;
      movie.available_resolutions = onPlex.resolutions;
      movie.imdb_data = imdb_data;
      movie.reviews = reviews.results;
      if (!minified) {
        if (recommendations.results.length === 0) {
          let params = {};
          if (movie.genres) {
            let genres = "";
            for (let i = 0; i < movie.genres.length; i++) {
              genres += `${movie.genres[i].id},`;
            }

            params.with_genres = genres;
          }
          recommendations = await discoverMovie(1, params);
        }
      }
      if (recommendations.results) {
        Object.keys(recommendations.results).map((key) => {
          let recommendation = recommendations.results[key];
          if (recommendation.id !== parseInt(id))
            recommendationsData.push(recommendation.id);
        });
      }
      if (!minified && movie.belongs_to_collection) {
        collectionData = [];
        collection.parts.map((part) => {
          collectionData.push(part.id);
        });
      }

      movie.recommendations = recommendationsData;
      movie.collection = collectionData;
      movie.keywords.results = movie.keywords.keywords;
      movie.keywords.keywords = {};

      delete movie.production_countries;
      delete movie.budget;
      delete movie.adult;
      delete movie.original_title;
      // delete movie.production_companies;
      if (minified) {
        delete movie.credits;
        delete movie.backdrop_path;
        delete movie.belongs_to_collection;
        delete movie.genres;
        delete movie.homepage;
        delete movie.popularity;
        delete movie.recommendations;
        delete movie.revenue;
        delete movie.runtime;
        delete movie.spoken_languages;
        delete movie.status;
        delete movie.tagline;
        delete movie.videos;
        delete movie.vote_average;
        delete movie.vote_count;
      } else {
        movie.original_language_format = ISO6391.getName(
          movie.original_language
        );
      }

      return movie;
    } catch (err) {
      logger.log("warn", `Error processing movie data - ${id}`);
      logger.log({ level: "error", message: err });
      return { error: "not found" };
    }
  }
}

// Caching Layer

async function getMovieData(id) {
  let data = false;
  try {
    data = await memoryCache.wrap(id, function () {
      return tmdbData(id);
    });
  } catch (err) {
    logger.log("warn", `Error getting movie data - ${id}`);
    logger.log({ level: "error", message: err });
  }
  return data;
}

async function getRecommendations(id, page = 1) {
  let data = false;
  try {
    data = await memoryCache.wrap(`rec_${id}_${page}`, function () {
      return recommendationData(id, page);
    });
  } catch (err) {
    logger.log("warn", `Error getting movie recommendations - ${id}`);
    logger.log({ level: "error", message: err });
  }
  return data;
}

async function getReviews(id) {
  let data = false;
  try {
    data = await memoryCache.wrap(`rev_${id}`, function () {
      return reviewsData(id);
    });
  } catch (err) {
    logger.log("warn", `Error getting movie reviews - ${id}`);
    logger.log({ level: "error", message: err });
  }
  return data;
}

async function getCollection(id) {
  let data = false;
  try {
    data = await memoryCache.wrap(`col_${id}`, function () {
      return collectionData(id);
    });
  } catch (err) {
    logger.log("warn", `Error getting movie collections - ${id}`);
    logger.log({ level: "error", message: err });
  }
  return data;
}

// Lookup Layer

function tmdbData(id) {
  const config = getConfig();
  const tmdbApikey = config.tmdbApi;
  const tmdb = "https://api.themoviedb.org/3/";
  let url = `${tmdb}movie/${id}?api_key=${tmdbApikey}&append_to_response=credits,videos,keywords,release_dates`;
  return new Promise((resolve, reject) => {
    request(
      url,
      {
        method: "GET",
        json: true,
      },
      function (err, data) {
        if (err) {
          reject();
        }
        if (!data) reject();
        data.timestamp = new Date();
        if (data.release_dates) {
          data.age_rating = findEnRating(data.release_dates.results);
          delete data.release_dates;
        }
        resolve(data);
      }
    );
  });
}

async function recommendationData(id, page = 1) {
  const config = getConfig();
  const tmdbApikey = config.tmdbApi;
  const tmdb = "https://api.themoviedb.org/3/";
  let url = `${tmdb}movie/${id}/recommendations?api_key=${tmdbApikey}&page=${page}`;

  return new Promise((resolve, reject) => {
    request(
      url,
      {
        method: "GET",
        json: true,
      },
      function (err, data) {
        if (err) {
          reject(err);
        }

        resolve(data);
      }
    );
  });
}

async function collectionData(id) {
  const config = getConfig();
  const tmdbApikey = config.tmdbApi;
  const tmdb = "https://api.themoviedb.org/3/";
  let url = `${tmdb}collection/${id}?api_key=${tmdbApikey}`;

  return new Promise((resolve, reject) => {
    request(
      url,
      {
        method: "GET",
        json: true,
      },
      function (err, data) {
        if (err) {
          reject(err);
        }

        resolve(data);
      }
    );
  });
}

async function reviewsData(id) {
  const config = getConfig();
  const tmdbApikey = config.tmdbApi;
  const tmdb = "https://api.themoviedb.org/3/";
  let url = `${tmdb}movie/${id}/reviews?api_key=${tmdbApikey}`;

  return new Promise((resolve, reject) => {
    request(
      url,
      {
        method: "GET",
        json: true,
      },
      function (err, data) {
        if (err) {
          reject(err);
        }

        resolve(data);
      }
    );
  });
}

// Lets i18n this soon
function findEnLogo(logos) {
  let logoUrl = false;
  logos.forEach((logo) => {
    if (logo.lang === "en" && !logoUrl) {
      logoUrl = logo.url;
    }
  });
  return logoUrl;
}

// Lets i18n this soon
function findEnRating(data) {
  let rating = false;
  data.forEach((item) => {
    if (item.iso_3166_1 === "US") {
      rating = item.release_dates[0].certification;
    }
  });
  return rating;
}

function discoverMovie(page = 1, params = {}) {
  const config = getConfig();
  const tmdbApikey = config.tmdbApi;
  const tmdb = "https://api.themoviedb.org/3/";
  let par = "";
  Object.keys(params).map((i) => {
    par += `&${i}=${params[i]}`;
  });
  let url = `${tmdb}discover/movie?api_key=${tmdbApikey}${par}&page=${page}`;
  return new Promise((resolve, reject) => {
    request(
      url,
      {
        method: "GET",
        json: true,
      },
      function (err, data) {
        if (err) {
          reject(err);
        }

        resolve(data);
      }
    );
  });
}

function company(id) {
  const config = getConfig();
  const tmdbApikey = config.tmdbApi;
  const tmdb = "https://api.themoviedb.org/3/";
  let url = `${tmdb}company/${id}?api_key=${tmdbApikey}`;
  return new Promise((resolve, reject) => {
    request(
      url,
      {
        method: "GET",
        json: true,
      },
      function (err, data) {
        if (err) {
          reject(err);
        }

        resolve(data);
      }
    );
  });
}

module.exports = {
  discoverMovie,
  movieLookup,
  company,
  getRecommendations,
};
