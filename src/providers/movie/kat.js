// Import the neccesary modules.
import asyncq from "async-q";
import katApi from "kat-api-pt";
import { global } from "../../config/global";
import Helper from "./helper";
import { katMap } from "../../config/kat";
import Util from "../../util";

/**
 * @class
 * @classdesc The factory function for scraping movies from {@link https://kat.cr/}.
 * @memberof module:providers/movie/kat
 * @param {String} name - The name of the KAT provider.
 * @property {Object} helper - The helper object for adding shows.
 * @property {Object} kat - Configured {@link https://kat.cr/} scraper.
 * @property {Object} util - The util object with general functions.
 */
const KAT = name => {

  const helper = Helper(name);
  const kat = new katApi();
  const util = Util();

  /**
   * @description Get all the movies.
   * @function KAT#getMovie
   * @memberof module:providers/movie/kat
   * @param {Object} katMovie - The movie information.
   * @returns {Movie} - A movie.
   */
  const getMovie = async katMovie => {
    try {
      const newMovie = await helper.getTraktInfo(katMovie.slugYear);
      if (newMovie && newMovie._id) {
        delete katMovie.movieTitle;
        delete katMovie.slug;
        delete katMovie.slugYear;
        delete katMovie.torrentLink;
        delete katMovie.quality;
        delete katMovie.year;
        delete katMovie.language;

        return await helper.addTorrents(newMovie, katMovie);
      }
    } catch (err) {
      return util.onError(err);
    }
  };

  /**
   * @description Extract movie information based on a regex.
   * @function KAT#extractMovie
   * @memberof module:providers/movie/kat
   * @param {Object} torrent - The torrent to extract the movie information from.
   * @param {String} language - The language of the torrent.
   * @param {Regex} regex - The regex to extract the movie information.
   * @returns {Object} - Information about a movie from the torrent.
   */
  const extractMovie = (torrent, language, regex) => {
    let movieTitle = torrent.title.match(regex)[1];
    if (movieTitle.endsWith(" ")) movieTitle = movieTitle.substring(0, movieTitle.length - 1);
    movieTitle = movieTitle.replace(/\./g, " ");
    let slug = movieTitle.replace(/\s+/g, "-").toLowerCase();
    slug = slug in katMap ? katMap[slug] : slug;
    const year = torrent.title.match(regex)[2];
    const quality = torrent.title.match(regex)[3];

    const movie = { movieTitle, slug, slugYear: `${slug}-${year}`, torrentLink: torrent.link, year, quality, language };

    movie[language] = {};
    movie[language][quality] = {
      url: torrent.magnet,
      seed: torrent.seeds,
      peer: torrent.peers,
      size: torrent.size,
      fileSize: torrent.fileSize,
      provider: name
    };

    return movie;
  };

  /**
   * @description Get movie info from a given torrent.
   * @function KAT#getMovieData
   * @memberof module:providers/movie/kat
   * @param {Object} torrent - A torrent object to extract movie information
   * from.
   * @param {String} language - The language of the torrent.
   * @returns {Object} - Information about a movie from the torrent.
   */
  const getMovieData = (torrent, language) => {
    const threeDimensions = /(.*).(\d{4}).[3Dd]\D+(\d{3,4}p)/;
    const fourKay = /(.*).(\d{4}).[4k]\D+(\d{3,4}p)/;
    const withYear = /(.*).(\d{4})\D+(\d{3,4}p)/;
    if (torrent.title.match(threeDimensions)) {
      return extractMovie(torrent, language, threeDimensions);
    } else if (torrent.title.match(fourKay)) {
      return extractMovie(torrent, language, fourKay);
    } else if (torrent.title.match(withYear)) {
      return extractMovie(torrent, language, withYear);
    } else {
      console.warn(`${name}: Could not find data from torrent: '${torrent.title}'`);
    }
  };

  /**
   * @description Puts all the found movies from the torrents in an array.
   * @function KAT#getAllKATMovies
   * @memberof module:providers/movie/kat
   * @param {Array} torrents - A list of torrents to extract movie information.
   * @param {String} language - The language of the torrent.
   * @returns {Array} - A list of objects with movie information extracted from
   * the torrents.
   */
  const getAllKATMovies = async (torrents, language) => {
    try {
      const movies = [];
      await asyncq.mapSeries(torrents, torrent => {
        if (torrent) {
          const movie = getMovieData(torrent, language);
          if (movie) {
            if (movies.length != 0) {
              const { movieTitle, slug, language, quality } = movie;
              const matching = movies
                .filter(m => m.movieTitle === movieTitle)
                .filter(m => m.slug === slug);

              if (matching.length != 0) {
                const index = movies.indexOf(matching[0]);
                if (!matching[0][language][quality]) matching[0][language][quality] = movie[language][quality];

                movies.splice(index, 1, matching[0]);
              } else {
                movies.push(movie);
              }
            } else {
              movies.push(movie);
            }
          }
        }
      });
      return movies;
    } catch (err) {
      return util.onError(err);
    }
  };

  /**
   * @description Get all the torrents of a given provider.
   * @function KAT#getAllTorrents
   * @memberof module:providers/movie/kat
   * @param {Integer} totalPages - The total pages of the query.
   * @param {Object} provider - The provider to query {@link https://kat.cr/}.
   * @returns {Array} - A list of all the queried torrents.
   */
  const getAllTorrents = async(totalPages, provider) => {
    try {
      let katTorrents = [];
      await asyncq.timesSeries(totalPages, async page => {
        try {
          provider.query.page = page + 1;
          console.log(`${name}: Starting searching kat on page ${provider.query.page} out of ${totalPages}`);
          const result = await kat.search(provider.query);
          katTorrents = katTorrents.concat(result.results);
        } catch (err) {
          return util.onError(err);
        }
      });
      console.log(`${name}: Found ${katTorrents.length} torrents.`);
      return katTorrents;
    } catch (err) {
      return util.onError(err);
    }
  };

  /**
   * @description Returns a list of all the inserted torrents.
   * @function KAT#search
   * @memberof module:providers/movie/kat
   * @param {Object} provider - The provider to query {@link https://kat.cr/}.
   * @returns {Array} - A list of scraped movies.
   */
  const search = async provider => {
    try {
      if (!provider.query.language) return util.onError(`Provider with name: '${name}' does not have a language set!`);

      console.log(`${name}: Starting scraping...`);
      provider.query.page = 1;
      provider.query.category = "movies";
      provider.query.verified = 1;
      provider.query.adult_filter = 1;

      const getTotalPages = await kat.search(provider.query);
      const totalPages = getTotalPages.totalPages; // Change to 'const' for production.
      if (!totalPages) return util.onError(`${name}: totalPages returned: '${totalPages}'`);
      // totalPages = 3; // For testing purposes only.
      console.log(`${name}: Total pages ${totalPages}`);

      const katTorrents = await getAllTorrents(totalPages, provider);
      const katMovies = await getAllKATMovies(katTorrents, provider.query.language);
      return await asyncq.mapLimit(katMovies, global.maxWebRequest,
        katMovie => getMovie(katMovie).catch(err => util.onError(err)));
    } catch (err) {
      util.onError(err);
    }
  };

  // Return the public functions.
  return {
    search
  };

};

// Export the KAT factory function.
export default KAT;
